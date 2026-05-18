# =============================================================================
# CI/CD設定 (GitHub Actions OIDC)
# =============================================================================
# GitHub Actions から OIDC 認証で AWS リソースにアクセス
# AWS アカウントに1つだけ作成し、全環境で共有

data "aws_caller_identity" "current" {}

# GitHub OIDC プロバイダー
resource "aws_iam_openid_connect_provider" "github" {
  url             = "https://token.actions.githubusercontent.com" # Github Actions OIDCトークン発行元URL
  client_id_list  = ["sts.amazonaws.com"]                         # OIDCトークンのaudience（対象者）
  thumbprint_list = ["ffffffffffffffffffffffffffffffffffffffff"]  # ダミーデータでOK
}

# GitHub Actions 用 IAM ロール
resource "aws_iam_role" "github_actions" {
  name = "${var.project_name}-github-actions"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:${var.github_repository}:*"
          }
        }
      }
    ]
  })
}

# ECR プッシュポリシー
resource "aws_iam_policy" "ecr_push" {
  name        = "${var.project_name}-ecr-push"
  description = "Policy for pushing images to ECR from GitHub Actions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = "*"
      },
      {
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:BatchGetImage",
          "ecr:BatchImportLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:InitiateLayerUpload",
          "ecr:PutImage",
          "ecr:UploadLayerPart"
        ]
        Resource = aws_ecr_repository.server.arn
      }
    ]
  })
}

# ECR プッシュポリシーを GitHub Actions ロールにアタッチ
resource "aws_iam_role_policy_attachment" "ecr_push" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.ecr_push.arn
}

# ECS デプロイ用ポリシー
resource "aws_iam_policy" "ecs_deploy" {
  name        = "${var.project_name}-ecs-deploy"
  description = "Policy for deploying to ECS from GitHub Actions"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition",
          "ecs:RegisterTaskDefinition",
          "ecs:UpdateService",
          "ecs:DescribeServices"
        ]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/${var.project_name}-*-execution-role"
      }
    ]
  })
}

# ECS デプロイポリシーを GitHub Actions ロールにアタッチ
resource "aws_iam_role_policy_attachment" "ecs_deploy" {
  role       = aws_iam_role.github_actions.name
  policy_arn = aws_iam_policy.ecs_deploy.arn
}

# =============================================================================
# Terraform Apply 用の管理者権限
# =============================================================================
# GitHub Actions から terraform plan / apply を実行するために必要。
# plan は管理対象リソースの read、apply は read/write がそれぞれ必要で、
# 追加するたびに policy を細かく更新していくのは dev では運用負荷が大きいため
# AdministratorAccess を attach する方針。
#
# 含まれる権限:
# - tfstate アクセス (S3 + DynamoDB)
# - VPC / EC2 / ALB / ECS / ECR / RDS / ElastiCache / Route53 / ACM /
#   Secrets Manager / CloudWatch Logs / IAM など、step1〜10 で必要になる全リソース
#
# TODO: prd 環境を作るタイミングで、CloudTrail で実使用 action を抽出し、
#       scoped policy を作成して prd ロールには attach、dev もそちらに切り替えて
#       本 attachment は剥がす。
resource "aws_iam_role_policy_attachment" "github_actions_admin" {
  role       = aws_iam_role.github_actions.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}
