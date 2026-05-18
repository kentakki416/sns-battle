resource "aws_secretsmanager_secret" "this" {
  name                    = var.name
  description             = "Application secrets for ${var.name}"
  recovery_window_in_days = var.recovery_window_in_days

  tags = var.tags
}

# initial_values を JSON 文字列としてまとめて投入する。
# ECS task definition は valueFrom: <arn>:KEY:: の形で個別キーを引ける。
resource "aws_secretsmanager_secret_version" "this" {
  secret_id     = aws_secretsmanager_secret.this.id
  secret_string = jsonencode(var.initial_values)
}
