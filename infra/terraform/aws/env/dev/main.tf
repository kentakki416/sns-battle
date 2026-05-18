# =============================================================================
# Dev Environment - Main Configuration
# =============================================================================

# 共通設定とローカル変数
locals {
  # 基本設定
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * サブネット CIDR の計算
   * - public:   10.0.1.0/24, 10.0.2.0/24  (ALB / NAT Gateway 配置)
   * - private:  10.0.11.0/24, 10.0.12.0/24 (ECS task 配置、NAT 経由で outbound)
   * - isolated: 10.0.21.0/24, 10.0.22.0/24 (RDS / ElastiCache 配置)
   *
   * modules/vpc は public/private しか subnet_type を持たないため isolated も "private" 扱いとし、
   * 結果的に NAT route table に紐付くが RDS/Redis は outbound を開始しないため問題なし。
   */
  public_subnet_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnet_cidrs  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 11)]
  isolated_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 21)]

  /**
   * subnet キーは「<role><az-suffix>」の規約。既存の public 命名と整合させる。
   * 例: public1-a / public1-c / private1-a / private1-c / isolated1-a / isolated1-c
   */
  public_subnet_keys   = [for az in var.availability_zones : "public${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  private_subnet_keys  = [for az in var.availability_zones : "private${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]
  isolated_subnet_keys = [for az in var.availability_zones : "isolated${substr(az, length(az) - 2, 1)}-${substr(az, length(az) - 1, 1)}"]

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
# - public (ALB / NAT) / private (ECS) / isolated (RDS / Redis) の 3 階層
# - NAT Gateway 1 個（dev コスト優先）
module "vpc" {
  source = "../../modules/vpc"

  # === 基本設定 ===
  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true
  create_nat_gateway      = true
  nat_gateway_subnet_key  = local.public_subnet_keys[0]

  # === サブネット設定 ===
  subnets = merge(
    /** public subnet: ALB + NAT Gateway 配置 */
    {
      for i, az in var.availability_zones :
      local.public_subnet_keys[i] => {
        cidr_block        = local.public_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "public"
      }
    },
    /** private subnet: ECS task 配置 */
    {
      for i, az in var.availability_zones :
      local.private_subnet_keys[i] => {
        cidr_block        = local.private_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
    /** isolated subnet: RDS / ElastiCache 配置 (module 制約で subnet_type=private) */
    {
      for i, az in var.availability_zones :
      local.isolated_subnet_keys[i] => {
        cidr_block        = local.isolated_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
  )

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
    rds = {
      name        = "${local.name_prefix}-rds"
      description = "Security group for RDS Postgres"
    }
    redis = {
      name        = "${local.name_prefix}-redis"
      description = "Security group for ElastiCache Redis"
    }
  }

  # === セキュリティグループルール ===
  security_group_rules = [
    # ALB Ingress - インターネットからHTTPSを受け付ける
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 443
      to_port             = 443
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTPS from internet"
    },
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
    # ECS Egress - NAT 経由で外部 (ECR / Secrets Manager / LiveKit Cloud) へ
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound traffic via NAT"
    },
    # RDS Ingress - ECS から 5432 のみ許可
    {
      security_group_name        = "rds"
      type                       = "ingress"
      from_port                  = 5432
      to_port                    = 5432
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Postgres from ECS"
    },
    # Redis Ingress - ECS から 6379 のみ許可
    {
      security_group_name        = "redis"
      type                       = "ingress"
      from_port                  = 6379
      to_port                    = 6379
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Redis from ECS"
    },
  ]

}

# =============================================================================
# DNS / TLS (Route 53 + ACM)
# =============================================================================

# Route 53 + ACM
# - domain_name が指定されたときのみ起動 (count = 0/1)
# - 事前に AWS Console で Route 53 にドメインを取得し、hosted zone が自動作成済みであること
module "route53" {
  source = "../../modules/route53"
  count  = var.domain_name != "" ? 1 : 0

  domain_name = var.domain_name
  subdomain   = var.subdomain

  alb_dns_name = null
  alb_zone_id  = null

  tags = local.common_tags
}

# =============================================================================
# アプリケーション機密 (Secrets Manager)
# =============================================================================

# JWT 署名鍵 (Access / Refresh) は Terraform 内で自動生成して Secrets Manager に投入する。
# 外部から提供される値ではないので random_password で十分。
# tfstate に値が残るが、S3 KMS 暗号化で保護される前提。
resource "random_password" "jwt_access_secret" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false
}

# Application secrets
# - JWT は random_password で自動生成
# - DATABASE_URL / REDIS_HOST はプレースホルダ。step4 / step5 で実値を流し込む
# - GOOGLE_* / LIVEKIT_* / FRONTEND_URL は TF_VAR で渡す。未指定なら空文字のまま登録される
module "app_secrets" {
  source = "../../modules/secrets"

  name = "/${local.name_prefix}/app"

  initial_values = {
    # JWT
    JWT_ACCESS_SECRET      = random_password.jwt_access_secret.result
    JWT_REFRESH_SECRET     = random_password.jwt_refresh_secret.result
    JWT_ACCESS_EXPIRATION  = "15m"
    JWT_REFRESH_EXPIRATION = "30d"

    # Datastore (step4 / step5 で実値に置き換え)
    DATABASE_URL = "REPLACED_BY_STEP4"
    REDIS_HOST   = "REPLACED_BY_STEP5"
    REDIS_PORT   = "6379"
    REDIS_DB     = "0"

    # Server
    NODE_ENV     = "production"
    PORT         = "8080"
    LOG_LEVEL    = "info"
    FRONTEND_URL = var.frontend_url

    # OAuth / LiveKit (TF_VAR で渡す)
    GOOGLE_CLIENT_ID       = var.google_client_id
    GOOGLE_CLIENT_SECRET   = var.google_client_secret
    LIVEKIT_HOST           = var.livekit_host
    LIVEKIT_API_KEY        = var.livekit_api_key
    LIVEKIT_API_SECRET     = var.livekit_api_secret
    LIVEKIT_WEBHOOK_SECRET = var.livekit_webhook_secret
  }

  tags = local.common_tags
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
  subnets         = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]

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
  # ECS task を private subnet に配置し、NAT 経由で外部接続する。
  # assign_public_ip = false にしてもイメージ pull / Secrets Manager 取得は NAT 経由で成立する。
  network_configuration = {
    subnets          = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
    security_groups  = [module.vpc.security_groups["ecs"].id]
    assign_public_ip = false
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
