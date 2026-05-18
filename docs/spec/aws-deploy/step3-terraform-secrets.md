# step3: Secrets Manager（アプリケーション機密の管理）

JWT secret / Google OAuth / LiveKit などのアプリケーション機密を Secrets Manager に集約し、ECS task definition から `secrets:` ブロックで環境変数として注入する。

`DATABASE_URL` / `REDIS_HOST` などのインフラ依存値は、step4 / step5 で RDS / ElastiCache を作る際に Terraform から書き込む。

## 対応内容

### 1. modules/secrets を新規作成

`infra/terraform/aws/modules/secrets/` を作成。

#### `modules/secrets/terraform.tf`

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

#### `modules/secrets/variables.tf`

```hcl
variable "name" {
  type        = string
  description = "Secret 名（例: /sns-battle/dev/app）"
}

variable "initial_values" {
  type        = map(string)
  description = "初期投入する key-value。後から手動で更新する想定"
  default     = {}
  sensitive   = true
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

#### `modules/secrets/main.tf`

```hcl
resource "aws_secretsmanager_secret" "this" {
  name        = var.name
  description = "Application secrets for ${var.name}"

  /** dev でも誤削除防止のため復元猶予を設ける */
  recovery_window_in_days = 7

  tags = var.tags
}

/**
 * 初期値は jsonencode した文字列として登録。
 * 各 key は ECS task definition の secrets: ブロックで JMESPath 風に
 * "valueFrom": "arn:...:secret-name:KEY::" のように個別取り出しできる。
 */
resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode(var.initial_values)

  /**
   * Terraform 管理外で値を更新したい場合に備え、
   * secret_string の変更を ignore する選択肢もある。
   * 今回は dev なので Terraform 一元管理とする。
   */
}
```

#### `modules/secrets/outputs.tf`

```hcl
output "secret_arn" {
  value = aws_secretsmanager_secret.this.arn
}

output "secret_name" {
  value = aws_secretsmanager_secret.this.name
}
```

### 2. env/dev での呼び出し

`infra/terraform/aws/env/dev/main.tf` に追加:

```hcl
/**
 * アプリ用シークレット（DB / Redis 接続情報以外）
 * - JWT / Google OAuth / LiveKit は terraform.tfvars or 環境変数経由で渡す
 * - DB / Redis は step4 / step5 で Terraform から書き込む
 */
module "app_secrets" {
  source = "../../modules/secrets"

  name = "/${local.name_prefix}/app"

  initial_values = {
    JWT_ACCESS_SECRET      = var.jwt_access_secret
    JWT_REFRESH_SECRET     = var.jwt_refresh_secret
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_REFRESH_EXPIRATION = "30d"
    GOOGLE_CLIENT_ID       = var.google_client_id
    GOOGLE_CLIENT_SECRET   = var.google_client_secret
    LIVEKIT_HOST           = var.livekit_host
    LIVEKIT_API_KEY        = var.livekit_api_key
    LIVEKIT_API_SECRET     = var.livekit_api_secret
    LIVEKIT_WEBHOOK_SECRET = var.livekit_webhook_secret

    /** step4 / step5 で書き換える（プレースホルダ） */
    DATABASE_URL = "REPLACED_BY_STEP4"
    REDIS_HOST   = "REPLACED_BY_STEP5"
    REDIS_PORT   = "6379"
    REDIS_DB     = "0"

    /** Server 用 */
    NODE_ENV     = "production"
    PORT         = "8080"
    LOG_LEVEL    = "info"
    FRONTEND_URL = var.frontend_url
  }

  tags = local.common_tags
}
```

### 3. variables.tf に機密値を追加

`infra/terraform/aws/env/dev/variables.tf`:

```hcl
variable "jwt_access_secret" {
  type      = string
  sensitive = true
}

variable "jwt_refresh_secret" {
  type      = string
  sensitive = true
}

variable "google_client_id" {
  type      = string
  sensitive = true
}

variable "google_client_secret" {
  type      = string
  sensitive = true
}

variable "livekit_host" {
  type        = string
  description = "wss://xxx.livekit.cloud"
}

variable "livekit_api_key" {
  type      = string
  sensitive = true
}

variable "livekit_api_secret" {
  type      = string
  sensitive = true
}

variable "livekit_webhook_secret" {
  type      = string
  sensitive = true
}

variable "frontend_url" {
  type        = string
  description = "Vercel の公開 URL（CORS / OAuth コールバック用）"
}
```

### 4. ECS task role に GetSecretValue 権限を付与

step7 で ECS module を拡張する際に、task role に IAM policy を付ける（詳細は step7）。ここでは Secrets Manager 側の準備のみ。

### 5. tfvars の渡し方

機密値は **`terraform.tfvars` を gitignore して**ローカル管理するか、**GitHub Actions の Secrets** から渡す。

```bash
# ローカル apply の場合
export TF_VAR_jwt_access_secret="$(openssl rand -base64 32)"
export TF_VAR_jwt_refresh_secret="$(openssl rand -base64 32)"
export TF_VAR_google_client_id="..."
export TF_VAR_google_client_secret="..."
export TF_VAR_livekit_host="wss://xxx.livekit.cloud"
export TF_VAR_livekit_api_key="..."
export TF_VAR_livekit_api_secret="..."
export TF_VAR_livekit_webhook_secret="..."
export TF_VAR_frontend_url="https://your-vercel-project.vercel.app"
export TF_VAR_domain_name="sns-battle-dev.com"

terraform apply
```

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply

# 作成された Secret を確認
aws secretsmanager get-secret-value \
  --secret-id /sns-battle-dev/app \
  --query SecretString --output text | jq .
```

- 出力に JWT / Google / LiveKit の値が入っており、`DATABASE_URL` と `REDIS_HOST` は仮値（step4 / step5 で上書き予定）

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| `terraform apply` で `Secret already scheduled for deletion` | 過去に作って消した名前と同じ。`recovery_window_in_days = 0` で即時削除するか、別名にする。`aws secretsmanager restore-secret --secret-id xxx` でも復元可 |
| 値が空文字で登録される | `TF_VAR_*` の export 忘れ。`terraform plan` で `+ "..." -> ""` のように見えたら警戒 |
