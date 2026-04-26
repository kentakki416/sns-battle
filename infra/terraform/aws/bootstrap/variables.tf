# =============================================================================
# Bootstrap Variables
# =============================================================================

variable "project_name" {
  description = "プロジェクト名（S3バケット名とDynamoDBテーブル名のプレフィックスに使用）"
  type        = string
  default     = "sns-battle" # TODO: プロジェクト名に変更してください
}

variable "aws_region" {
  description = "AWSリージョン"
  type        = string
  default     = "ap-northeast-1"
}

variable "s3_bucket_name" {
  description = "Terraform State保存用のS3バケット名（AWS全体でグローバルに一意である必要があります。他のAWSアカウントで既に使用されている名前は使用できません）"
  type        = string
  default     = "sns-battle-terraform-state-20250101" # TODO: プロジェクト名、日付、UUIDなどを含めて一意のバケット名に変更してください
}

variable "dynamodb_table_name" {
  description = "Terraform State Lock用のDynamoDBテーブル名"
  type        = string
  default     = "sns-battle-terraform-state-lock" # TODO: 一意のテーブル名に変更してください
}

# =============================================================================
# CI/CD設定
# =============================================================================

variable "github_repository" {
  description = "GitHubリポジトリ（例: owner/repo-name）"
  type        = string
  default     = "kentakki416/sns-battle" # TODO: 実際のリポジトリに変更してください
}
