# =============================================================================
# Lifecycle Hook for Blue/Green Deployment
# =============================================================================
# POST_TEST_TRAFFIC_SHIFT ステージでLambdaを呼び出し、
# SSMパラメータによる手動承認が得られるまでデプロイを一時停止する。
#
# 承認: aws ssm put-parameter --name "<param>" --value "approved" --overwrite
# 拒否: aws ssm put-parameter --name "<param>" --value "rejected" --overwrite

# -----------------------------------------------------------------------------
# SSM Parameter - デプロイ承認フラグ
# -----------------------------------------------------------------------------

resource "aws_ssm_parameter" "deploy_approval" {
  count = var.enable_blue_green ? 1 : 0

  name  = "/${var.service_name}/deploy/approval"
  type  = "String"
  value = "pending"

  # Lambdaが値を更新するため、Terraformでの差分を無視
  lifecycle {
    ignore_changes = [value]
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# Lambda Function - デプロイ承認チェック
# -----------------------------------------------------------------------------

data "archive_file" "deployment_hook" {
  count = var.enable_blue_green ? 1 : 0

  type        = "zip"
  source_file = "${path.module}/lambda/deployment_hook.mjs"
  output_path = "${path.module}/lambda/deployment_hook.zip"
}

resource "aws_lambda_function" "deployment_hook" {
  count = var.enable_blue_green ? 1 : 0

  function_name = "${var.service_name}-deployment-hook"
  role          = aws_iam_role.lambda_deployment_hook[0].arn
  handler       = "deployment_hook.handler"
  runtime       = "nodejs22.x"
  timeout       = 30

  filename         = data.archive_file.deployment_hook[0].output_path
  source_code_hash = data.archive_file.deployment_hook[0].output_base64sha256

  environment {
    variables = {
      APPROVAL_PARAMETER_NAME = aws_ssm_parameter.deploy_approval[0].name
    }
  }

  tags = var.tags
}

# -----------------------------------------------------------------------------
# IAM Role - Lambda実行ロール
# -----------------------------------------------------------------------------

# Lambda関数の実行ロール
# SSMパラメータの読み書き + CloudWatch Logsへのログ出力権限
resource "aws_iam_role" "lambda_deployment_hook" {
  count = var.enable_blue_green ? 1 : 0

  name = "${var.service_name}-deployment-hook-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# CloudWatch Logs書き込み権限
data "aws_iam_policy" "lambda_basic_execution" {
  count = var.enable_blue_green ? 1 : 0
  name  = "AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  count = var.enable_blue_green ? 1 : 0

  role       = aws_iam_role.lambda_deployment_hook[0].name
  policy_arn = data.aws_iam_policy.lambda_basic_execution[0].arn
}

# SSMパラメータの読み書き権限
resource "aws_iam_role_policy" "lambda_ssm" {
  count = var.enable_blue_green ? 1 : 0

  name = "ssm-deploy-approval"
  role = aws_iam_role.lambda_deployment_hook[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:PutParameter"
        ]
        Resource = aws_ssm_parameter.deploy_approval[0].arn
      }
    ]
  })
}

# -----------------------------------------------------------------------------
# IAM Role - ECSがLambdaを呼び出すためのロール
# -----------------------------------------------------------------------------

# ECSコントロールプレーンがLambdaを呼び出すためのサービスロール
resource "aws_iam_role" "ecs_lifecycle_hook" {
  count = var.enable_blue_green ? 1 : 0

  name = "${var.service_name}-lifecycle-hook"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "ecs_invoke_lambda" {
  count = var.enable_blue_green ? 1 : 0

  name = "invoke-deployment-hook-lambda"
  role = aws_iam_role.ecs_lifecycle_hook[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = aws_lambda_function.deployment_hook[0].arn
      }
    ]
  })
}
