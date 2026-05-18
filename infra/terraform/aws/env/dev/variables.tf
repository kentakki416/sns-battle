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
# 空のままだと route53 モジュールは起動しない (count = 0)。
# ドメインを Route 53 で取得後、TF_VAR_domain_name で渡すと cert 発行が始まる。

variable "domain_name" {
  description = "Route 53 で取得済みのルートドメイン（例: sns-battle-dev.com）。空のとき route53 モジュールはスキップされる"
  type        = string
  default     = ""
}

variable "subdomain" {
  description = "環境サブドメイン（例: dev）。証明書は *.<subdomain>.<domain> のワイルドカードを発行"
  type        = string
  default     = "dev"
}
