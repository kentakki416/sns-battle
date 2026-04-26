# =============================================================================
# Dev Environment - Main Configuration
# =============================================================================

# 共通設定とローカル変数
locals {
  # 基本設定
  name_prefix = "${var.project_name}-${var.environment}"

  # サブネットCIDRの計算
  public_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]

  # 共通タグ
  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )
}

# =============================================================================
# ネットワーク設定 (VPC, サブネット, セキュリティグループ)
# =============================================================================

# VPCモジュール呼び出し
# - 開発環境用のシンプルなネットワークを構築
# - パブリックサブネットのみ使用
module "vpc" {
  source = "../../modules/vpc"

  # === 基本設定 ===
  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true
  create_nat_gateway      = false

  # === サブネット設定 ===
  subnets = {
    for i, az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}" => {
      cidr_block        = local.public_subnet_cidrs[i]
      availability_zone = az
      subnet_type       = "public"
    }
  }

  # === セキュリティグループ定義 ===
  security_groups = {
    alb = {
      name        = "${local.name_prefix}-alb"
      description = "Security group for ALB"
    }
    ecs = {
      name        = "${local.name_prefix}-ecs"
      description = "Security group for ECS tasks"
    }
  }

  # === セキュリティグループルール ===
  security_group_rules = [
    # ALB Ingress - インターネットからHTTPを受け付ける
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 80
      to_port             = 80
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTP from internet"
    },
    # ALB Ingress - Blue/Greenテスト用リスナー（ポート9000）
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 9000
      to_port             = 9000
      protocol            = "tcp"
      cidr_blocks         = var.test_listener_allowed_cidrs
      description         = "Test listener for Blue/Green deployment"
    },
    # ALB Egress
    {
      security_group_name = "alb"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic"
    },
    # ECS Ingress - ALBからのみアプリポートを受け付ける
    {
      security_group_name        = "ecs"
      type                       = "ingress"
      from_port                  = var.app_port
      to_port                    = var.app_port
      protocol                   = "tcp"
      source_security_group_name = "alb"
      description                = "From ALB only"
    },
    # ECS Egress
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic"
    }
  ]

}

# =============================================================================
# コンテナレジストリ (ECR)
# =============================================================================

# bootstrapで作成済みのECRリポジトリを参照
data "aws_ecr_repository" "api" {
  name = "${var.project_name}-server"
}

# =============================================================================
# ロードバランサー設定 (Application Load Balancer)
# =============================================================================

# ALBモジュール呼び出し
# - インターネットからの通信を受けてECSに振り分け
module "alb" {
  source = "../../modules/alb"

  # === 基本設定 ===
  name            = "${local.name_prefix}-alb"
  vpc_id          = module.vpc.vpc_id
  security_groups = [module.vpc.security_groups["alb"].id]
  subnets = [
    for i, az in var.availability_zones :
    module.vpc.subnets["public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"].id
  ]

  # === ターゲットグループ設定 ===
  target_group_port = var.app_port
  listener_port     = "80"

  # === Blue/Greenデプロイ設定 ===
  enable_blue_green = true

  # === タグ設定 ===
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-alb"
      Component = "LoadBalancer"
    }
  )
}

# =============================================================================
# コンテナ実行環境設定 (ECS Fargate)
# =============================================================================

# ECSモジュール呼び出し
# - Fargateを使用したサーバーレスコンテナ実行環境
module "ecs" {
  source = "../../modules/ecs"

  # === 基本設定 ===
  cluster_name           = "${local.name_prefix}-cluster"
  task_definition_family = "${local.name_prefix}-task"
  service_name           = "${local.name_prefix}-service"

  # === リソース設定 ===
  cpu    = var.ecs_task_cpu
  memory = var.ecs_task_memory

  # === コンテナ設定 ===
  container_name  = "${local.name_prefix}-api"
  container_image = "${data.aws_ecr_repository.api.repository_url}:latest"
  container_port  = var.app_port

  # === ネットワーク設定 ===
  network_configuration = {
    subnets = [
      for i, az in var.availability_zones :
      module.vpc.subnets["public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"].id
    ]
    security_groups  = [module.vpc.security_groups["ecs"].id]
    assign_public_ip = true
  }

  # === ロードバランサー連携 ===
  target_group_arn = module.alb.target_group_blue_arn

  # === Blue/Greenデプロイ設定 ===
  enable_blue_green = true
  blue_green_configuration = {
    alternate_target_group_arn   = module.alb.target_group_green_arn
    production_listener_rule_arn = module.alb.listener_rule_arn
    test_listener_rule_arn       = module.alb.test_listener_rule_arn
    bake_time_in_minutes         = 5
  }

  # === ログ設定 ===
  log_retention_in_days = var.log_retention_days

  # === タグ設定 ===
  tags = merge(
    local.common_tags,
    {
      Name      = "${local.name_prefix}-ecs"
      Component = "Container"
    }
  )
}
