# step6: ALB HTTPS + idle timeout + Route 53 A レコード

既存の ALB module を HTTPS 対応に拡張し、SSE 用に idle timeout を 3600 秒に設定する。Route 53 に `api.dev.<domain>` の Alias レコードを作成して外部公開する。

## 対応内容

### 1. modules/alb の拡張

`infra/terraform/aws/modules/alb/variables.tf` に追加:

```hcl
variable "certificate_arn" {
  type        = string
  default     = null
  description = "ACM 証明書 ARN。null なら HTTP のみ。指定すれば HTTPS listener を作る"
}

variable "idle_timeout" {
  type        = number
  default     = 60
  description = "ALB の idle timeout（秒）。SSE 用に 3600 を指定する"
}
```

`infra/terraform/aws/modules/alb/alb.tf` の `aws_lb` リソースに追加:

```hcl
resource "aws_lb" "this" {
  ...
  idle_timeout = var.idle_timeout
  ...
}
```

HTTPS listener を追加（既存の HTTP listener と共存）:

```hcl
/**
 * HTTPS listener
 * - certificate_arn が指定されたときのみ作成
 * - HTTP listener は 80 → 443 リダイレクトに切り替える
 */
resource "aws_lb_listener" "https" {
  count             = var.certificate_arn != null ? 1 : 0
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }
}

/** HTTP は 443 にリダイレクト（HTTPS 化されたら HTTP を直接受けない） */
resource "aws_lb_listener_rule" "http_to_https" {
  count        = var.certificate_arn != null ? 1 : 0
  listener_arn = aws_lb_listener.this.arn
  priority     = 1

  action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }

  condition {
    path_pattern {
      values = ["/*"]
    }
  }
}
```

Blue/Green 既存ロジックは HTTP listener にぶら下がっているため、dev では一旦 HTTPS にも同じ blue target group を向けるシンプル構成にする。Blue/Green を HTTPS でも使いたい場合は別 issue で対応。

### 2. env/dev の ALB 呼び出しを更新

```hcl
module "alb" {
  source = "../../modules/alb"

  name            = "${local.name_prefix}-alb"
  vpc_id          = module.vpc.vpc_id
  security_groups = [module.vpc.security_groups["alb"].id]
  subnets         = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]

  target_group_port = var.app_port
  listener_port     = "80"

  /** HTTPS 化 */
  certificate_arn = module.route53.certificate_arn

  /** SSE 用に長めの idle timeout */
  idle_timeout = 3600

  enable_blue_green = true

  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-alb"
      Component = "LoadBalancer"
    }
  )
}
```

### 3. Route 53 A レコードの作成

`modules/route53` に `api` サブドメイン用の Alias レコードを追加する。ALB ARN を後から渡せる形にする。

`modules/route53/variables.tf` に追加:

```hcl
variable "alb_dns_name" {
  type    = string
  default = null
}

variable "alb_zone_id" {
  type    = string
  default = null
}
```

`modules/route53/main.tf` に追加:

```hcl
/** api.dev.<domain> → ALB */
resource "aws_route53_record" "api" {
  count   = var.alb_dns_name != null ? 1 : 0
  zone_id = data.aws_route53_zone.this.zone_id
  name    = "api.${var.subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.alb_dns_name
    zone_id                = var.alb_zone_id
    evaluate_target_health = true
  }
}
```

`env/dev/main.tf` の `module "route53"` 呼び出しに ALB 情報を渡す:

```hcl
module "route53" {
  source = "../../modules/route53"

  domain_name = var.domain_name
  subdomain   = var.subdomain

  alb_dns_name = module.alb.dns_name
  alb_zone_id  = module.alb.zone_id

  tags = local.common_tags
}
```

`modules/alb/outputs.tf` に `dns_name` と `zone_id` の output が無ければ追加:

```hcl
output "dns_name" {
  value = aws_lb.this.dns_name
}

output "zone_id" {
  value = aws_lb.this.zone_id
}
```

### 4. 循環依存に注意

- `route53` → `alb`: ACM 証明書 ARN を ALB に渡す
- `alb` → `route53`: ALB DNS 名を Route 53 A レコードに渡す

これは Terraform で問題なし（リソース単位の依存解決のため）。ただし `module` 間で循環するように見えると Terraform がエラーを出すので、必要なら `null_resource` + `triggers` で順序制御するか、`route53` モジュールを「証明書のみ」と「DNS レコードのみ」に分割する。

dev では同一ファイル内で書き、リソース単位の依存にする方が簡単。`route53` モジュールを以下のように分けるのが綺麗:

- `module.route53_cert` — ACM 証明書 + DNS 検証
- `module.route53_record` — A レコード（ALB DNS 取得後に作る）

簡略化のため、本 step では `route53` を 1 モジュールとし、`alb_dns_name = null` の初回 apply → ALB ができてから 2 回目 apply で A レコード作成、という運用もアリ。Terraform の依存解決で 1 回で済むことも多いので、まずは 1 回で試す。

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply
```

- `terraform apply` 完了後:

```bash
# ACM 証明書が ALB にアタッチされているか
aws elbv2 describe-listeners \
  --load-balancer-arn $(aws elbv2 describe-load-balancers --names sns-battle-dev-alb --query 'LoadBalancers[0].LoadBalancerArn' --output text) \
  --query 'Listeners[?Port==`443`]'

# Route 53 レコード
dig api.dev.<domain> +short
# ALB の DNS 名（A レコードの Alias 先）が解決される

# HTTPS で health check（API service 起動前なので 5xx でも OK、TLS handshake が成功すること）
curl -i https://api.dev.<domain>/
```

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| `curl: (35) SSL_ERROR_*` | ACM 証明書が ALB に正しくアタッチされていない。`describe-listeners` で `Certificates` を確認 |
| `dig` で答えない | Route 53 A レコードが作られていない。`route53` モジュールを `alb_dns_name` を渡した状態で再 apply |
| SSE が 60 秒で切れる | ALB の `idle_timeout` を確認: `aws elbv2 describe-load-balancer-attributes` で `idle_timeout.timeout_seconds = 3600` になっているか |
