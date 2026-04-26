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
  description = "パブリックサブネットIDのリスト"
  value = [
    for i, az in var.availability_zones :
    module.vpc.subnets["public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"].id
  ]
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
