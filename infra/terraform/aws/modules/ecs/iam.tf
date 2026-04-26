# =============================================================================
# IAM Resources for ECS
# =============================================================================

# AWS管理ポリシーの参照
# dataブロックでポリシーを参照することで、ARNのハードコードを避け、
# ポリシーが存在しない場合はplan時点でエラーを検出できる
data "aws_iam_policy" "ecs_task_execution" {
  name = "AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy" "ecs_infrastructure_lb" {
  count = var.enable_blue_green ? 1 : 0
  name  = "AmazonECSInfrastructureRolePolicyForLoadBalancers"
}

# =============================================================================
# ECS Task Execution Role
# =============================================================================

# Fargateタスクの実行に必要なロール
# Principal: ecs-tasks.amazonaws.com（タスク実行エージェント）
resource "aws_iam_role" "ecs_task_execution_role" {
  name = "${var.task_definition_family}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# AmazonECSTaskExecutionRolePolicy をアタッチ
# - ECRからのイメージプル権限
# - CloudWatch Logsへのログ書き込み権限
resource "aws_iam_role_policy_attachment" "ecs_task_execution_role_policy" {
  role       = aws_iam_role.ecs_task_execution_role.name
  policy_arn = data.aws_iam_policy.ecs_task_execution.arn
}

# =============================================================================
# ECS ALB Service Role (Blue/Green deployment)
# =============================================================================

# Blue/Greenデプロイ時にECSがターゲットグループを操作するためのロール
# Principal: ecs.amazonaws.com（ECSコントロールプレーン）
# ※ タスク実行ロール（ecs-tasks）とは異なり、デプロイ制御用のサービスロール
resource "aws_iam_role" "ecs_alb_service_role" {
  count = var.enable_blue_green ? 1 : 0

  name = "${var.service_name}-alb-service-role"

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

# AmazonECSInfrastructureRolePolicyForLoadBalancers をアタッチ
# - ターゲットグループへのターゲット登録/解除権限
# - Blue/Green切り替え時のトラフィックルーティング制御権限
resource "aws_iam_role_policy_attachment" "ecs_alb_service_role_policy" {
  count = var.enable_blue_green ? 1 : 0

  role       = aws_iam_role.ecs_alb_service_role[0].name
  policy_arn = data.aws_iam_policy.ecs_infrastructure_lb[0].arn
}
