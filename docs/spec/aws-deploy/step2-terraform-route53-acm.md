# step2: Route 53 + ACM 証明書

AWS で新規ドメインを取得し、hosted zone と ACM ワイルドカード証明書を作成する。step6 で ALB に証明書をアタッチし、`api.dev.<domain>` を公開する。

## 対応内容

### 1. ドメイン取得（Console での手動操作）

Terraform は Route 53 のドメイン購入（`aws_route53domains_registered_domain`）にも対応するが、初回は **AWS Console で手動取得**するのが安全（解約 / リネーム不可、年額発生のため）。

1. AWS Console → Route 53 → Registered domains → Register domain
2. 任意のドメイン（例: `sns-battle-dev.com`、`.com` で年 $12〜）を選択
3. 連絡先情報を入力 → 購入
4. Route 53 → Hosted zones を確認。**ドメインと同名の hosted zone が自動作成される**

以降の Terraform では、この hosted zone を `data` で参照する。

### 2. modules/route53 を新規作成

`infra/terraform/aws/modules/route53/` を作成。

#### `modules/route53/terraform.tf`

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}
```

#### `modules/route53/variables.tf`

```hcl
variable "domain_name" {
  type        = string
  description = "ルートドメイン（例: sns-battle-dev.com）。Route 53 で取得済みであること"
}

variable "subdomain" {
  type        = string
  description = "環境用サブドメイン（例: dev）。証明書は *.dev.<domain> のワイルドカードを発行する"
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

#### `modules/route53/main.tf`

```hcl
/** 既存 hosted zone をデータソースで取得（Console で取得済み前提） */
data "aws_route53_zone" "this" {
  name         = var.domain_name
  private_zone = false
}

/**
 * ACM ワイルドカード証明書
 * - *.dev.<domain> をカバー
 * - <domain> 自体は SAN に含めない（dev 環境のみで使うサブドメイン専用）
 */
resource "aws_acm_certificate" "wildcard" {
  domain_name       = "*.${var.subdomain}.${var.domain_name}"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = var.tags
}

/** DNS 検証用レコードを Route 53 に自動作成 */
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = data.aws_route53_zone.this.zone_id
}

/** 検証完了を待機 */
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
```

#### `modules/route53/outputs.tf`

```hcl
output "zone_id" {
  value = data.aws_route53_zone.this.zone_id
}

output "certificate_arn" {
  value = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "fqdn_api" {
  value = "api.${var.subdomain}.${var.domain_name}"
}
```

### 3. env/dev で呼び出す

`infra/terraform/aws/env/dev/variables.tf` に追加:

```hcl
variable "domain_name" {
  type        = string
  description = "Route 53 で取得済みのルートドメイン"
}

variable "subdomain" {
  type        = string
  default     = "dev"
  description = "環境サブドメイン"
}
```

`infra/terraform/aws/env/dev/main.tf` に追加:

```hcl
module "route53" {
  source = "../../modules/route53"

  domain_name = var.domain_name
  subdomain   = var.subdomain

  tags = local.common_tags
}
```

`infra/terraform/aws/env/dev/terraform.tfvars`（gitignore 推奨）に:

```hcl
domain_name = "sns-battle-dev.com"
subdomain   = "dev"
```

または `TF_VAR_domain_name=sns-battle-dev.com` の環境変数で渡す。

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply
```

- ACM 証明書が `ISSUED` ステータスになるまで数分〜10 分待つ
- Console で確認: ACM → Certificates → `*.dev.<domain>` が **Issued** になっていること
- Route 53 → Hosted zones → `<domain>` に `_xxx.dev.<domain>` の検証用 CNAME レコードが残っていること

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| `terraform apply` が長時間 hang（10 分以上） | Console で証明書ステータスが `Pending validation` のまま。検証 CNAME が hosted zone に書かれているか確認。`data.aws_route53_zone` が正しい zone を指しているか |
| `domain_validation_options` が空 | `validation_method = "DNS"` を確認。`EMAIL` だと options が空になる |
| 既に証明書がある | `lifecycle { create_before_destroy = true }` により新規発行 → 古いものを後で剥がす流れになる。問題なし |
