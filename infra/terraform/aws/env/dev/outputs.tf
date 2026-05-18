# =============================================================================
# Outputs
# =============================================================================

# VPC
output "vpc_id" {
  description = "VPC ID"
  value       = module.vpc.vpc_id
}

# Subnets
output "public_subnet_ids" {
  description = "パブリックサブネットIDのリスト (ALB / NAT Gateway 配置)"
  value       = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
}

output "private_subnet_ids" {
  description = "プライベートサブネットIDのリスト (ECS task 配置)"
  value       = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
}

output "isolated_subnet_ids" {
  description = "アイソレートサブネットIDのリスト (RDS / ElastiCache 配置)"
  value       = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
}

# Security Groups
output "ecs_security_group_id" {
  description = "ECS task に付与する SG の ID"
  value       = module.vpc.security_groups["ecs"].id
}

output "rds_security_group_id" {
  description = "RDS に付与する SG の ID"
  value       = module.vpc.security_groups["rds"].id
}

output "redis_security_group_id" {
  description = "ElastiCache に付与する SG の ID"
  value       = module.vpc.security_groups["redis"].id
}

# ALB
output "alb_dns_name" {
  description = "ALBのDNS名（アプリケーションへのアクセスURL）"
  value       = module.alb.alb_dns_name
}

output "alb_zone_id" {
  description = "ALBのZone ID"
  value       = module.alb.alb_zone_id
}

# ECS
output "ecs_cluster_name" {
  description = "ECSクラスター名"
  value       = module.ecs.cluster_name
}

output "ecs_service_name" {
  description = "ECSサービス名"
  value       = module.ecs.service_name
}
