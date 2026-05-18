# =============================================================================
# 基本設定
# =============================================================================

variable "project_name" {
  description = "プロジェクト名"
  type        = string
  default     = "sns-battle" # TODO: bootstrapと同じプロジェクト名に変更してください
}

variable "environment" {
  description = "環境名（dev, stg, prd）"
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}


# =============================================================================
# ネットワーク設定
# =============================================================================

variable "vpc_cidr" {
  description = "VPCのCIDRブロック"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones" {
  description = "使用するAvailability Zones"
  type        = list(string)
  default     = ["ap-northeast-1a", "ap-northeast-1c"]
}

# =============================================================================
# アプリケーション設定
# =============================================================================

variable "app_port" {
  description = "アプリケーションのポート番号"
  type        = number
  default     = 8080
}

# =============================================================================
# Blue/Greenデプロイ設定
# =============================================================================

variable "test_listener_allowed_cidrs" {
  description = "テスト用リスナー（ポート9000）へのアクセスを許可するCIDRリスト（本番ではVPN/社内IPに制限推奨）"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

# =============================================================================
# ECS設定
# =============================================================================

variable "ecs_task_cpu" {
  description = "ECSタスクのCPUユニット（256 = 0.25 vCPU, 512 = 0.5 vCPU, 1024 = 1 vCPU）"
  type        = string
  default     = "256"
}

variable "ecs_task_memory" {
  description = "ECSタスクのメモリ（MB）"
  type        = string
  default     = "512"
}

variable "log_retention_days" {
  description = "CloudWatch Logsの保存期間（日数）"
  type        = number
  default     = 3
}

# =============================================================================
# タグ設定
# =============================================================================

variable "additional_tags" {
  description = "追加のタグ"
  type        = map(string)
  default     = {}
}

# =============================================================================
# Route 53 / ACM
# =============================================================================

variable "domain_name" {
  description = "Route 53 で取得済みのルートドメイン。"
  type        = string
  default     = "sns-battle.com"
}

variable "subdomain" {
  description = "環境サブドメイン（例: dev）。証明書は *.<subdomain>.<domain> のワイルドカードを発行"
  type        = string
  default     = "dev"
}

# =============================================================================
# Secrets (アプリケーション機密)
# =============================================================================
# JWT secret は random_password で Terraform 内自動生成するため変数なし。
# 外部サービス由来の値 (Google OAuth, LiveKit) は未取得段階では空文字でよく、
# 値を取得したら TF_VAR_xxx で渡して再 apply すると Secrets Manager に反映される。

variable "google_client_id" {
  description = "Google OAuth client ID。公開識別子だが API 側と一致が必要"
  type        = string
  default     = ""
}

variable "google_client_secret" {
  description = "Google OAuth client secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "livekit_host" {
  description = "LiveKit Cloud の wss:// エンドポイント"
  type        = string
  default     = ""
}

variable "livekit_api_key" {
  description = "LiveKit API key"
  type        = string
  default     = ""
}

variable "livekit_api_secret" {
  description = "LiveKit API secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "livekit_webhook_secret" {
  description = "LiveKit Webhook 署名検証用 secret"
  type        = string
  default     = ""
  sensitive   = true
}

variable "frontend_url" {
  description = "Vercel の公開 URL (CORS / OAuth callback に使用)"
  type        = string
  default     = ""
}
