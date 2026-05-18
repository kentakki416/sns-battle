# step5: ElastiCache Redis 7

isolated subnet に Redis 7（cluster-mode disabled、1 ノード）を作成し、`REDIS_HOST` をアプリ用 Secret に書き込む。

BullMQ は `cluster-mode disabled` でも問題なく動作する。本番 Multi-AZ は将来構想。

## 対応内容

### 1. modules/elasticache を新規作成

`infra/terraform/aws/modules/elasticache/`

#### `modules/elasticache/variables.tf`

```hcl
variable "name" {
  type = string
}

variable "engine_version" {
  type    = string
  default = "7.1"
}

variable "node_type" {
  type    = string
  default = "cache.t4g.micro"
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

#### `modules/elasticache/main.tf`

```hcl
resource "aws_elasticache_subnet_group" "this" {
  name       = "${var.name}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

/**
 * Replication group（cluster-mode disabled）を 1 ノード構成で作成。
 * - BullMQ は単一エンドポイントで OK
 * - 認証は dev では無効（VPC 内のみアクセス可なので問題なし）
 * - 認証を有効化する場合は auth_token を設定し、Secrets Manager で管理
 */
resource "aws_elasticache_replication_group" "this" {
  replication_group_id = var.name
  description          = "Redis for ${var.name}"

  engine               = "redis"
  engine_version       = var.engine_version
  node_type            = var.node_type
  port                 = 6379
  parameter_group_name = "default.redis7"

  num_cache_clusters         = 1
  automatic_failover_enabled = false
  multi_az_enabled           = false

  subnet_group_name  = aws_elasticache_subnet_group.this.name
  security_group_ids = var.security_group_ids

  /**
   * dev では暗号化を有効化（in-transit）するとアプリ側で TLS 設定が必要になり手間が増える。
   * 一旦 OFF で進め、本番化時に有効化する。
   */
  transit_encryption_enabled = false
  at_rest_encryption_enabled = true

  apply_immediately = true

  /** snapshot は dev では取らない */
  snapshot_retention_limit = 0

  tags = var.tags
}
```

#### `modules/elasticache/outputs.tf`

```hcl
output "primary_endpoint_address" {
  value = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  value = aws_elasticache_replication_group.this.port
}
```

### 2. env/dev での呼び出し

`infra/terraform/aws/env/dev/main.tf` に追加:

```hcl
module "elasticache" {
  source = "../../modules/elasticache"

  name      = "${local.name_prefix}-redis"
  node_type = "cache.t4g.micro"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["redis"].id]

  tags = local.common_tags
}
```

### 3. app_secrets の REDIS_HOST を実値で上書き

step3 の `module "app_secrets"` の `initial_values` を更新:

```hcl
module "app_secrets" {
  ...
  initial_values = {
    ...
    REDIS_HOST = module.elasticache.primary_endpoint_address
    REDIS_PORT = tostring(module.elasticache.port)
    REDIS_DB   = "0"
    ...
  }

  depends_on = [module.rds, module.elasticache]
}
```

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply
```

- ElastiCache の作成に 5〜10 分かかる
- Console 確認: ElastiCache → Redis → `sns-battle-dev-redis` が `available`、Primary Endpoint が表示される
- Secrets Manager 確認:

```bash
aws secretsmanager get-secret-value \
  --secret-id /sns-battle-dev/app \
  --query SecretString --output text | jq -r .REDIS_HOST
# sns-battle-dev-redis.xxx.cache.amazonaws.com
```

実際の接続確認は step8 以降のデプロイ後、API service のログで `redis connected` を確認する。

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| `InvalidParameterValue: The parameter ReplicationGroupId must contain only letters, digits, and dashes...` | アンダースコア NG。ハイフンに統一 |
| `Cache subnet group must contain at least 2 unique availability zones` | dev でも subnet group には 2 AZ 分の subnet を入れる必要がある。`num_cache_clusters = 1` でも subnet group は Multi-AZ で OK |
| アプリから `ECONNREFUSED` | SG 設定漏れ。redis SG の Ingress に `ecs` SG を許可しているか確認 |
| アプリから `WRONGPASS` | `transit_encryption_enabled = true` にして `auth_token` を設定したのに、ioredis に `password` を渡していない。dev は暗号化 OFF が無難 |
