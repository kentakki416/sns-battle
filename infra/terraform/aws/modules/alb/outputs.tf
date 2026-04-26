# =============================================================================
# ALB Module Outputs
# =============================================================================

output "alb_id" {
  description = "ALB ID"
  value       = aws_lb.main.id
}

output "alb_arn" {
  description = "ALB ARN"
  value       = aws_lb.main.arn
}

output "alb_dns_name" {
  description = "ALB DNS name"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "ALB zone ID"
  value       = aws_lb.main.zone_id
}

output "target_group_blue_arn" {
  description = "Blue target group ARN"
  value       = aws_lb_target_group.blue.arn
}

output "target_group_green_arn" {
  description = "Green target group ARN"
  value       = var.enable_blue_green ? aws_lb_target_group.green[0].arn : null
}

output "listener_arn" {
  description = "Listener ARN"
  value       = aws_lb_listener.main.arn
}

output "listener_rule_arn" {
  description = "Production listener rule ARN for Blue/Green deployment"
  value       = var.enable_blue_green ? aws_lb_listener_rule.production[0].arn : null
}

output "test_listener_rule_arn" {
  description = "Test listener rule ARN for Blue/Green deployment verification"
  value       = var.enable_blue_green ? aws_lb_listener_rule.test[0].arn : null
}
