# =============================================================================
# Bootstrap Outputs
# =============================================================================

# Terraform State
output "s3_bucket_name" {
  description = "Terraform State保存用のS3バケット名"
  value       = aws_s3_bucket.terraform_state.id
}

output "dynamodb_table_name" {
  description = "Terraform State Lock用のDynamoDBテーブル名"
  value       = aws_dynamodb_table.terraform_state_lock.name
}

output "aws_region" {
  description = "AWSリージョン"
  value       = var.aws_region
}

# ECR
output "ecr_repository_url" {
  description = "ECRリポジトリURL"
  value       = aws_ecr_repository.server.repository_url
}

# GitHub OIDC
output "github_actions_role_arn" {
  description = "GitHub Actions用IAMロールのARN"
  value       = aws_iam_role.github_actions.arn
}
