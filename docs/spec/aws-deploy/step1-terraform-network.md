# step1: ネットワーク拡張（private / isolated subnet + NAT Gateway）

`modules/vpc` 自体は既に `subnet_type = "private"` と `create_nat_gateway` をサポート済み。env/dev 呼び出し側で **private subnet 2 つ・isolated subnet 2 つ・NAT Gateway 1 つ** を追加し、RDS / Redis 用の Security Group を新設する。

## 対応内容

### 1. CIDR 設計

`infra/terraform/aws/env/dev/main.tf` の `locals` ブロックで CIDR を計算する。

```hcl
locals {
  name_prefix = "${var.project_name}-${var.environment}"

  /**
   * subnet CIDR の割り当て
   * - public:   10.0.1.0/24, 10.0.2.0/24
   * - private:  10.0.11.0/24, 10.0.12.0/24
   * - isolated: 10.0.21.0/24, 10.0.22.0/24
   */
  public_subnet_cidrs   = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  private_subnet_cidrs  = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 11)]
  isolated_subnet_cidrs = [for i in range(2) : cidrsubnet(var.vpc_cidr, 8, i + 21)]

  common_tags = merge(
    {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "Terraform"
    },
    var.additional_tags
  )
}
```

### 2. VPC モジュール呼び出しを更新

`infra/terraform/aws/env/dev/main.tf` の `module "vpc"` ブロックを以下に置換。

```hcl
module "vpc" {
  source = "../../modules/vpc"

  name                    = local.name_prefix
  cidr_block              = var.vpc_cidr
  enable_dns_support      = true
  enable_dns_hostnames    = true
  create_internet_gateway = true

  /** NAT Gateway を有効化。dev は 1 個のみ（コスト優先） */
  create_nat_gateway    = true
  nat_gateway_subnet_id = module.vpc.subnets[local.public_subnet_keys[0]].id

  subnets = merge(
    /** public subnet (ALB / NAT 配置) */
    {
      for i, az in var.availability_zones :
      "public-${az}" => {
        cidr_block        = local.public_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "public"
      }
    },
    /** private subnet (ECS task 配置) */
    {
      for i, az in var.availability_zones :
      "private-${az}" => {
        cidr_block        = local.private_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
    /** isolated subnet (RDS / ElastiCache 配置)。private と route table が異なるため別 subnet_type にしたいが、modules/vpc が public/private しか持たないため private 扱いで OK（NAT 経由の outbound が不要なら別 route table を後付け） */
    {
      for i, az in var.availability_zones :
      "isolated-${az}" => {
        cidr_block        = local.isolated_subnet_cidrs[i]
        availability_zone = az
        subnet_type       = "private"
      }
    },
  )

  security_groups = {
    alb = {
      name        = "${local.name_prefix}-alb"
      description = "ALB security group"
    }
    ecs = {
      name        = "${local.name_prefix}-ecs"
      description = "ECS task security group"
    }
    rds = {
      name        = "${local.name_prefix}-rds"
      description = "RDS Postgres security group"
    }
    redis = {
      name        = "${local.name_prefix}-redis"
      description = "ElastiCache Redis security group"
    }
  }

  security_group_rules = [
    /** ALB Ingress: 443 / 80 を開放 */
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 443
      to_port             = 443
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTPS from internet"
    },
    {
      security_group_name = "alb"
      type                = "ingress"
      from_port           = 80
      to_port             = 80
      protocol            = "tcp"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "HTTP from internet (redirect to 443)"
    },
    {
      security_group_name = "alb"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound"
    },

    /** ECS Ingress: ALB から 8080 のみ */
    {
      security_group_name        = "ecs"
      type                       = "ingress"
      from_port                  = var.app_port
      to_port                    = var.app_port
      protocol                   = "tcp"
      source_security_group_name = "alb"
      description                = "From ALB only"
    },
    {
      security_group_name = "ecs"
      type                = "egress"
      from_port           = 0
      to_port             = 0
      protocol            = "-1"
      cidr_blocks         = ["0.0.0.0/0"]
      description         = "All outbound via NAT"
    },

    /** RDS Ingress: ECS から 5432 */
    {
      security_group_name        = "rds"
      type                       = "ingress"
      from_port                  = 5432
      to_port                    = 5432
      protocol                   = "tcp"
      source_security_group_name = "ecs"
      description                = "Postgres from ECS"
    },

    /** Redis Ingress: ECS から 6379 */
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
```

### 3. 既存 ALB / ECS の subnet 参照を private に切り替え

```hcl
locals {
  public_subnet_keys   = [for az in var.availability_zones : "public-${az}"]
  private_subnet_keys  = [for az in var.availability_zones : "private-${az}"]
  isolated_subnet_keys = [for az in var.availability_zones : "isolated-${az}"]
}

/** ALB は public のまま */
module "alb" {
  source = "../../modules/alb"
  ...
  subnets = [for k in local.public_subnet_keys : module.vpc.subnets[k].id]
  ...
}

/** ECS は private へ移動 + assign_public_ip = false */
module "ecs" {
  source = "../../modules/ecs"
  ...
  network_configuration = {
    subnets          = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
    security_groups  = [module.vpc.security_groups["ecs"].id]
    assign_public_ip = false
  }
  ...
}
```

`assign_public_ip = false` への変更は **NAT Gateway 経由で ECR / Secrets Manager / CloudWatch Logs に到達できる**ことが前提。NAT が無いと ECS task の起動時に ECR pull が失敗するので注意。

### 4. outputs.tf に subnet / SG ID を追加

後続 step（RDS / ElastiCache）から参照するため。

```hcl
output "private_subnet_ids" {
  value = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
}

output "isolated_subnet_ids" {
  value = [for k in local.isolated_subnet_keys : module.vpc.subnets[k].id]
}

output "rds_security_group_id" {
  value = module.vpc.security_groups["rds"].id
}

output "redis_security_group_id" {
  value = module.vpc.security_groups["redis"].id
}
```

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform fmt -recursive
terraform validate
terraform plan
```

- `plan` 出力で subnet が 6 個（public 2 + private 2 + isolated 2）作成されること
- NAT Gateway 1 個、EIP 1 個が新規作成されること
- 既存の ECS task が `public-*` → `private-*` subnet に **置換（replace）** される計画になること（在線セッション中なら一時的なダウンタイムあり）

問題なければ:

```bash
terraform apply
```

AWS Console でも確認:

- VPC → サブネット: 6 個できている
- NAT Gateway: 1 個 + EIP 1 個
- Security Groups: alb / ecs / rds / redis の 4 つ
- ECS task: private subnet に再配置され、Running 状態

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| ECS task が `Stopped (CannotPullContainerError)` | NAT Gateway 経由で ECR に到達できていない。route table の `0.0.0.0/0 → NAT` が private subnet に紐付いているか確認 |
| ECS task が `Stopped (ResourceInitializationError)` | CloudWatch Logs への出力で同上。NAT or VPC Endpoint が必要 |
