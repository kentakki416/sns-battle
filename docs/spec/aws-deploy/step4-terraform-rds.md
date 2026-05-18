# step4: RDS for PostgreSQL 16

isolated subnet に Postgres 16 を作成し、生成された接続情報を Secrets Manager の `DATABASE_URL` に書き込む。

## 対応内容

### 1. modules/rds を新規作成

`infra/terraform/aws/modules/rds/` を作成。

#### `modules/rds/variables.tf`

```hcl
variable "name" {
  type = string
}

variable "engine_version" {
  type    = string
  default = "16.4"
}

variable "instance_class" {
  type    = string
  default = "db.t4g.micro"
}

variable "allocated_storage" {
  type    = number
  default = 20
}

variable "db_name" {
  type        = string
  description = "初期データベース名"
  default     = "sns_battle"
}

variable "master_username" {
  type    = string
  default = "snsbattle"
}

variable "subnet_ids" {
  type = list(string)
}

variable "security_group_ids" {
  type = list(string)
}

variable "multi_az" {
  type    = bool
  default = false
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "skip_final_snapshot" {
  type    = bool
  default = false
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

#### `modules/rds/main.tf`

```hcl
resource "aws_db_subnet_group" "this" {
  name       = "${var.name}-subnet-group"
  subnet_ids = var.subnet_ids
  tags       = var.tags
}

/**
 * master password は AWS が自動生成し Secrets Manager に保存する。
 * manage_master_user_password = true で自動連携。
 */
resource "aws_db_instance" "this" {
  identifier = var.name

  engine         = "postgres"
  engine_version = var.engine_version
  instance_class = var.instance_class

  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.allocated_storage * 5
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = var.db_name
  username = var.master_username

  manage_master_user_password = true

  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = var.security_group_ids
  publicly_accessible    = false

  multi_az                = var.multi_az
  backup_retention_period = 7
  backup_window           = "17:00-18:00"
  maintenance_window      = "sun:18:00-sun:19:00"

  performance_insights_enabled = true
  performance_insights_retention_period = 7

  deletion_protection = var.deletion_protection
  skip_final_snapshot = var.skip_final_snapshot

  /** dev では auto minor upgrade を有効に */
  auto_minor_version_upgrade = true

  /** master password を Terraform state に保持しない */
  apply_immediately = true

  tags = var.tags

  lifecycle {
    ignore_changes = [
      /** Secrets Manager 経由でローテーションされるため */
      master_user_secret,
    ]
  }
}
```

#### `modules/rds/outputs.tf`

```hcl
output "endpoint" {
  value = aws_db_instance.this.endpoint
}

output "address" {
  value = aws_db_instance.this.address
}

output "port" {
  value = aws_db_instance.this.port
}

output "db_name" {
  value = aws_db_instance.this.db_name
}

output "master_username" {
  value = aws_db_instance.this.username
}

output "master_user_secret_arn" {
  value = aws_db_instance.this.master_user_secret[0].secret_arn
}
```

### 2. env/dev での呼び出し

`infra/terraform/aws/env/dev/main.tf` に追加:

```hcl
module "rds" {
  source = "../../modules/rds"

  name              = "${local.name_prefix}-db"
  instance_class    = "db.t4g.micro"
  allocated_storage = 20
  db_name           = "sns_battle"

  subnet_ids         = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
  security_group_ids = [module.vpc.security_groups["rds"].id]

  multi_az            = false
  deletion_protection = true
  skip_final_snapshot = false

  tags = local.common_tags
}

/**
 * master password を Secrets Manager から取得し、
 * DATABASE_URL を組み立ててアプリ用 Secret に書き込む。
 */
data "aws_secretsmanager_secret_version" "rds_master" {
  secret_id = module.rds.master_user_secret_arn
}

locals {
  rds_master = jsondecode(data.aws_secretsmanager_secret_version.rds_master.secret_string)
  database_url = format(
    "postgresql://%s:%s@%s:%d/%s?schema=public&sslmode=require",
    module.rds.master_username,
    local.rds_master.password,
    module.rds.address,
    module.rds.port,
    module.rds.db_name,
  )
}
```

### 3. app_secrets の DATABASE_URL を実値で上書き

step3 で作った `module "app_secrets"` の `initial_values` を更新:

```hcl
module "app_secrets" {
  source = "../../modules/secrets"
  ...
  initial_values = {
    ...
    DATABASE_URL = local.database_url
    DB_NAME      = module.rds.db_name
    ...
  }

  depends_on = [module.rds]
}
```

### 4. パスワード平文を state に置かない工夫（オプション）

`local.database_url` を直接 jsonencode すると平文が state に入る。気になる場合は **ECS task definition 側で複数 secret を組み合わせる**（`DB_PASSWORD` を別 secrets として注入し、起動コマンドで URL を組み立てる）構成にする。

dev では state を S3 + KMS 暗号化で保管しているため、簡略化のため文字列直接で OK としている。

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply
```

- RDS 作成に 10〜15 分かかる
- Console 確認: RDS → Databases → `sns-battle-dev-db` が `Available`、Endpoint が表示される
- Secrets Manager 確認:

```bash
aws secretsmanager get-secret-value \
  --secret-id /sns-battle-dev/app \
  --query SecretString --output text | jq -r .DATABASE_URL
# postgresql://snsbattle:xxx@sns-battle-dev-db.xxx.ap-northeast-1.rds.amazonaws.com:5432/sns_battle?schema=public&sslmode=require
```

接続確認は **step8 の migration task** で実施する。手動で確認したい場合は、後述する一時的な踏み台や `aws ssm start-session` 経由のポートフォワーディングを使う。

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| RDS 作成が `Failed` | subnet group が複数 AZ になっているか確認。isolated_subnet が 1 AZ のみだと失敗する |
| `master_user_secret` が null | RDS engine version が 16.x 未満。`manage_master_user_password` は 13.7+ で対応 |
| terraform destroy で削除できない | `deletion_protection = true` のため。一旦 `false` で apply してから destroy |
