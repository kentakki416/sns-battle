# =============================================================================
# Application Load Balancer Resources
# =============================================================================

# Application Load Balancer
resource "aws_lb" "main" {
  name               = var.name
  internal           = var.internal
  load_balancer_type = "application"
  security_groups    = var.security_groups
  subnets            = var.subnets

  enable_deletion_protection = var.enable_deletion_protection

  drop_invalid_header_fields = true

  tags = var.tags
}

# ALB Target Group (Blue)
resource "aws_lb_target_group" "blue" {
  name        = "${var.name}-blue"
  port        = var.target_group_port
  protocol    = var.target_group_protocol
  vpc_id      = var.vpc_id
  target_type = var.target_type

  health_check {
    enabled             = var.health_check.enabled
    healthy_threshold   = var.health_check.healthy_threshold
    interval            = var.health_check.interval
    matcher             = var.health_check.matcher
    path                = var.health_check.path
    port                = var.health_check.port
    protocol            = var.health_check.protocol
    timeout             = var.health_check.timeout
    unhealthy_threshold = var.health_check.unhealthy_threshold
  }

  tags = var.tags
}

# ALB Target Group (Green) - Blue/Greenデプロイ用
resource "aws_lb_target_group" "green" {
  count = var.enable_blue_green ? 1 : 0

  name        = "${var.name}-green"
  port        = var.target_group_port
  protocol    = var.target_group_protocol
  vpc_id      = var.vpc_id
  target_type = var.target_type

  health_check {
    enabled             = var.health_check.enabled
    healthy_threshold   = var.health_check.healthy_threshold
    interval            = var.health_check.interval
    matcher             = var.health_check.matcher
    path                = var.health_check.path
    port                = var.health_check.port
    protocol            = var.health_check.protocol
    timeout             = var.health_check.timeout
    unhealthy_threshold = var.health_check.unhealthy_threshold
  }

  tags = var.tags
}

# ALB Listener
resource "aws_lb_listener" "main" {
  load_balancer_arn = aws_lb.main.arn
  port              = var.listener_port
  protocol          = var.listener_protocol

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.blue.arn
  }

  # Blue/Greenデプロイ時にECSがdefault_actionを変更するため、差分を無視
  lifecycle {
    ignore_changes = [default_action]
  }
}

# Listener Rule for Blue/Green deployment
# ECSがトラフィック切り替え時にこのルールのactionを変更する
resource "aws_lb_listener_rule" "production" {
  count = var.enable_blue_green ? 1 : 0

  listener_arn = aws_lb_listener.main.arn
  priority     = 1

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  action {
    type = "forward"
    forward {
      target_group {
        arn    = aws_lb_target_group.blue.arn
        weight = 100
      }
      target_group {
        arn    = aws_lb_target_group.green[0].arn
        weight = 0
      }
    }
  }

  # ECSがデプロイ時にactionの重みを変更するため、差分を無視
  lifecycle {
    ignore_changes = [action]
  }
}

# =============================================================================
# Test Listener (Blue/Green deployment)
# =============================================================================

# テスト用リスナー
# - デプロイ中にGreen環境をポート9000経由で事前検証するためのリスナー
# - Web/Mobileから http://<ALB_DNS>:9000 でGreen環境にアクセス可能
resource "aws_lb_listener" "test" {
  count = var.enable_blue_green ? 1 : 0

  load_balancer_arn = aws_lb.main.arn
  port              = var.test_listener_port
  protocol          = var.listener_protocol

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green[0].arn
  }

  # ECSがデプロイ時にdefault_actionを変更するため、差分を無視
  lifecycle {
    ignore_changes = [default_action]
  }
}

# テスト用リスナールール
# - ECSのadvanced_configuration.test_listener_ruleに渡すルール
# - デプロイ中にECSがこのルールを制御してGreen TGにテストトラフィックをルーティング
resource "aws_lb_listener_rule" "test" {
  count = var.enable_blue_green ? 1 : 0

  listener_arn = aws_lb_listener.test[0].arn
  priority     = 1

  condition {
    path_pattern {
      values = ["/*"]
    }
  }

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.green[0].arn
  }

  # ECSがデプロイ時にactionを変更するため、差分を無視
  lifecycle {
    ignore_changes = [action]
  }
}
