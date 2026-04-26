# =============================================================================
# ECS Resources
# =============================================================================

# ECS Fargate Cluster
resource "aws_ecs_cluster" "main" {
  name = var.cluster_name

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = var.tags
}

# ECS Task Definition
resource "aws_ecs_task_definition" "main" {
  family                   = var.task_definition_family
  network_mode             = "awsvpc"    # Fargate必須のネットワークモード
  requires_compatibilities = ["FARGATE"] # Fargate専用の設定
  cpu                      = var.cpu     # CPUユニット (256 = 0.25 vCPU)
  memory                   = var.memory  # メモリ設定 (MB)
  execution_role_arn       = aws_iam_role.ecs_task_execution_role.arn

  # コンテナ定義
  container_definitions = jsonencode([
    {
      name  = var.container_name
      image = var.container_image

      # ポートマッピング設定
      portMappings = [
        {
          containerPort = var.container_port
          protocol      = "tcp"
        }
      ]

      # ログ設定 - CloudWatch Logsに送信
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ecs_log_group.name
          "awslogs-region"        = data.aws_region.current.id
          "awslogs-stream-prefix" = "ecs"
        }
      }
    }
  ])

  # CI/CDがcontainer_definitionsのimageを更新するため、Terraformでの差分を無視
  # 初回作成時のみvar.container_imageが使用され、以降はCI/CDが管理
  lifecycle {
    ignore_changes = [container_definitions]
  }

  tags = var.tags
}

# ECS Service
resource "aws_ecs_service" "main" {
  name            = var.service_name
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.main.arn
  desired_count   = var.desired_count # 希望するタスク数
  launch_type     = "FARGATE"         # Fargateでの実行

  # ネットワーク設定
  network_configuration {
    subnets          = var.network_configuration.subnets
    security_groups  = var.network_configuration.security_groups
    assign_public_ip = var.network_configuration.assign_public_ip
  }

  # Blue/Greenデプロイメント設定
  dynamic "deployment_configuration" {
    for_each = var.enable_blue_green ? [1] : []
    content {
      strategy             = "BLUE_GREEN"
      bake_time_in_minutes = var.blue_green_configuration.bake_time_in_minutes

      # テストトラフィック切り替え後にデプロイを一時停止し、手動承認を待つ
      lifecycle_hook {
        hook_target_arn  = aws_lambda_function.deployment_hook[0].arn
        lifecycle_stages = ["POST_TEST_TRAFFIC_SHIFT"]
        role_arn         = aws_iam_role.ecs_lifecycle_hook[0].arn
      }
    }
  }

  # ロードバランサー連携設定（通常モード）
  dynamic "load_balancer" {
    for_each = !var.enable_blue_green && var.target_group_arn != "" ? [1] : []
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.container_name
      container_port   = var.container_port
    }
  }

  # ロードバランサー連携設定（Blue/Greenモード）
  dynamic "load_balancer" {
    for_each = var.enable_blue_green && var.target_group_arn != "" ? [1] : []
    content {
      target_group_arn = var.target_group_arn
      container_name   = var.container_name
      container_port   = var.container_port

      advanced_configuration {
        alternate_target_group_arn = var.blue_green_configuration.alternate_target_group_arn
        production_listener_rule   = var.blue_green_configuration.production_listener_rule_arn
        test_listener_rule         = var.blue_green_configuration.test_listener_rule_arn
        role_arn                   = aws_iam_role.ecs_alb_service_role[0].arn
      }
    }
  }

  # サービス作成前にIAMロールが準備されるのを待機
  depends_on = [aws_iam_role_policy_attachment.ecs_task_execution_role_policy]

  tags = var.tags
}
