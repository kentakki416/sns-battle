# =============================================================================
# CloudWatch Resources for ECS
# =============================================================================

# CloudWatch Log Group for ECS Tasks
resource "aws_cloudwatch_log_group" "ecs_log_group" {
  name              = "/ecs/${var.task_definition_family}"
  retention_in_days = var.log_retention_in_days

  tags = var.tags
}

# Current AWS Region Data Source
data "aws_region" "current" {}
