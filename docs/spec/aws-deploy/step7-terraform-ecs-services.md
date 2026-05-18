# step7: ECS service 拡張（API + worker + migration task）

既存の `modules/ecs` は単一 service 前提。本 step では:

1. API service の task definition を **Secrets Manager 連携**に更新
2. **matching-worker 用の ECS Service** を新規作成（ALB に紐付けない）
3. **migration 用の task definition**（service なし、one-shot 実行用）を作成
4. ECR リポジトリ `sns-battle-worker` を bootstrap に追加

## 対応内容

### 1. bootstrap に worker 用 ECR を追加

`infra/terraform/aws/bootstrap/ecr.tf` に追加:

```hcl
resource "aws_ecr_repository" "worker" {
  name                 = "${var.project_name}-worker"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }

  tags = {
    Project = var.project_name
  }
}

resource "aws_ecr_lifecycle_policy" "worker" {
  repository = aws_ecr_repository.worker.name

  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThanCount"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
```

bootstrap を `terraform apply` で反映。

### 2. modules/ecs を「複数 service + task-only」対応に拡張

既存 `modules/ecs` の API 一本前提を、**ECS cluster は共通・service は呼び出し側で複数定義**する形に分割する。

選択肢 A: 既存 module を `service` を `map` で受け取る形にリファクタ
選択肢 B: 既存 module は `api` 用のまま残し、新規 `modules/ecs-service` で worker / migration を追加

dev 期間で素早く動かしたいので **選択肢 B**（既存に手を入れず追加）を推奨。

#### `modules/ecs-service/variables.tf`

```hcl
variable "name" {
  type = string
}

variable "cluster_arn" {
  type = string
}

variable "task_role_arn" {
  type = string
}

variable "execution_role_arn" {
  type = string
}

variable "image" {
  type = string
}

variable "cpu" {
  type    = number
  default = 256
}

variable "memory" {
  type    = number
  default = 512
}

variable "command" {
  type    = list(string)
  default = null
}

variable "container_port" {
  type    = number
  default = null
}

variable "secrets_arn" {
  type        = string
  description = "Secrets Manager の Secret ARN（key 単位で注入する）"
}

variable "secret_keys" {
  type        = list(string)
  description = "Secret から取り出す環境変数キーのリスト"
}

variable "environment" {
  type    = map(string)
  default = {}
}

variable "subnets" {
  type = list(string)
}

variable "security_groups" {
  type = list(string)
}

variable "assign_public_ip" {
  type    = bool
  default = false
}

variable "desired_count" {
  type    = number
  default = 1
}

variable "load_balancer" {
  type = object({
    target_group_arn = string
    container_port   = number
  })
  default = null
}

variable "create_service" {
  type        = bool
  default     = true
  description = "false なら task definition のみ作る（migration task 用）"
}

variable "log_group_name" {
  type = string
}

variable "tags" {
  type    = map(string)
  default = {}
}
```

#### `modules/ecs-service/main.tf`

```hcl
resource "aws_cloudwatch_log_group" "this" {
  name              = var.log_group_name
  retention_in_days = 7
  tags              = var.tags
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(var.cpu)
  memory                   = tostring(var.memory)

  execution_role_arn = var.execution_role_arn
  task_role_arn      = var.task_role_arn

  container_definitions = jsonencode([
    merge(
      {
        name      = var.name
        image     = var.image
        essential = true

        portMappings = var.container_port != null ? [
          {
            containerPort = var.container_port
            protocol      = "tcp"
          },
        ] : []

        environment = [
          for k, v in var.environment : { name = k, value = v }
        ]

        secrets = [
          for k in var.secret_keys : {
            name      = k
            valueFrom = "${var.secrets_arn}:${k}::"
          }
        ]

        logConfiguration = {
          logDriver = "awslogs"
          options = {
            awslogs-group         = aws_cloudwatch_log_group.this.name
            awslogs-region        = data.aws_region.current.name
            awslogs-stream-prefix = "ecs"
          }
        }
      },
      var.command != null ? { command = var.command } : {},
    ),
  ])

  tags = var.tags
}

resource "aws_ecs_service" "this" {
  count = var.create_service ? 1 : 0

  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  desired_count   = var.desired_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = var.subnets
    security_groups  = var.security_groups
    assign_public_ip = var.assign_public_ip
  }

  dynamic "load_balancer" {
    for_each = var.load_balancer != null ? [var.load_balancer] : []
    content {
      target_group_arn = load_balancer.value.target_group_arn
      container_name   = var.name
      container_port   = load_balancer.value.container_port
    }
  }

  /** デプロイ時のローリング更新 */
  deployment_minimum_healthy_percent = 50
  deployment_maximum_percent         = 200

  tags = var.tags
}

data "aws_region" "current" {}
```

#### `modules/ecs-service/outputs.tf`

```hcl
output "task_definition_arn" {
  value = aws_ecs_task_definition.this.arn
}

output "service_name" {
  value = var.create_service ? aws_ecs_service.this[0].name : null
}
```

### 3. IAM role の整備

ECS task が Secrets Manager から値を取れるよう、`execution_role` に policy を付与する。`modules/ecs/iam.tf`（既存）に追加するか、env/dev で個別に attach する。

`env/dev/main.tf` に追加:

```hcl
data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

/** Secrets Manager の Get 権限（既存 task execution role に追加） */
resource "aws_iam_role_policy" "ecs_secrets" {
  name = "${local.name_prefix}-ecs-secrets"
  role = module.ecs.task_execution_role_name  /** 既存 module の output 名に合わせる */

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [module.app_secrets.secret_arn]
    }]
  })
}
```

既存 `modules/ecs` の `iam.tf` で task_execution_role_name の output を追加していなければ、`modules/ecs/outputs.tf` に追加する。

### 4. 既存 API service の secrets 統合

既存 `module "ecs"` のままだと secrets 注入の仕組みが無いため、**dev では既存 module の代わりに `ecs-service` 経由で API service を再定義**する方が早い。`modules/ecs` は cluster + IAM のみに退避させる。

```hcl
/** cluster と IAM のみは既存 module を流用 */
module "ecs_cluster" {
  source = "../../modules/ecs"

  cluster_name           = "${local.name_prefix}-cluster"
  task_definition_family = "${local.name_prefix}-task"
  service_name           = "${local.name_prefix}-service"
  ...
  /** desired_count = 0 にして既存 service は実質停止 */
}

/** API service を新 module で再定義 */
module "ecs_api" {
  source = "../../modules/ecs-service"

  name               = "${local.name_prefix}-api"
  cluster_arn        = module.ecs_cluster.cluster_arn
  task_role_arn      = module.ecs_cluster.task_role_arn
  execution_role_arn = module.ecs_cluster.task_execution_role_arn

  image          = "${data.aws_ecr_repository.api.repository_url}:latest"
  cpu            = 256
  memory         = 512
  container_port = 8080

  secrets_arn = module.app_secrets.secret_arn
  secret_keys = [
    "DATABASE_URL", "DB_NAME",
    "REDIS_HOST", "REDIS_PORT", "REDIS_DB",
    "JWT_ACCESS_SECRET", "JWT_REFRESH_SECRET",
    "JWT_ACCESS_EXPIRATION", "JWT_REFRESH_EXPIRATION",
    "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET",
    "LIVEKIT_HOST", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_WEBHOOK_SECRET",
    "FRONTEND_URL", "NODE_ENV", "PORT", "LOG_LEVEL",
  ]

  subnets         = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
  security_groups = [module.vpc.security_groups["ecs"].id]

  load_balancer = {
    target_group_arn = module.alb.target_group_blue_arn
    container_port   = 8080
  }

  log_group_name = "/ecs/${local.name_prefix}-api"
  desired_count  = 1

  tags = local.common_tags
}
```

**注意**: 既存 `module.ecs` は dev では一旦切り離す（cluster と IAM だけ残す）か、デプロイ前に `terraform state rm` で external 化してリプレースする。state 操作で躓きやすいので、**dev 初回構築時に bootstrap からやり直すか、env/dev を一旦 destroy → 新 module 構成で apply** が一番素直。

### 5. matching-worker service の追加

```hcl
data "aws_ecr_repository" "worker" {
  name = "${var.project_name}-worker"
}

module "ecs_worker" {
  source = "../../modules/ecs-service"

  name               = "${local.name_prefix}-worker"
  cluster_arn        = module.ecs_cluster.cluster_arn
  task_role_arn      = module.ecs_cluster.task_role_arn
  execution_role_arn = module.ecs_cluster.task_execution_role_arn

  image  = "${data.aws_ecr_repository.worker.repository_url}:latest"
  cpu    = 256
  memory = 512

  secrets_arn = module.app_secrets.secret_arn
  secret_keys = [
    "DATABASE_URL",
    "REDIS_HOST", "REDIS_PORT", "REDIS_DB",
    "LIVEKIT_HOST", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET",
    "NODE_ENV", "LOG_LEVEL",
  ]

  subnets         = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
  security_groups = [module.vpc.security_groups["ecs"].id]

  /** ALB に紐付けない */
  load_balancer = null

  log_group_name = "/ecs/${local.name_prefix}-worker"
  desired_count  = 1

  tags = local.common_tags
}
```

### 6. migration 用 task definition の追加

service なし（`create_service = false`）、`command` で migration コマンドを上書き。

```hcl
module "ecs_migration" {
  source = "../../modules/ecs-service"

  name               = "${local.name_prefix}-migration"
  cluster_arn        = module.ecs_cluster.cluster_arn
  task_role_arn      = module.ecs_cluster.task_role_arn
  execution_role_arn = module.ecs_cluster.task_execution_role_arn

  /** API イメージを流用（Prisma が同梱されている） */
  image = "${data.aws_ecr_repository.api.repository_url}:latest"
  cpu    = 256
  memory = 512

  /**
   * 起動コマンドを Prisma migrate に上書き。
   * Dockerfile の WORKDIR は /app、ENTRYPOINT は tini なので、
   * command で node の代わりに pnpm exec prisma を呼ぶ。
   */
  command = [
    "node_modules/.bin/prisma",
    "migrate", "deploy",
    "--schema=dist/prisma/schema.prisma",
  ]

  secrets_arn = module.app_secrets.secret_arn
  secret_keys = ["DATABASE_URL"]

  subnets         = [for k in local.private_subnet_keys : module.vpc.subnets[k].id]
  security_groups = [module.vpc.security_groups["ecs"].id]

  /** service は作らない */
  create_service = false

  log_group_name = "/ecs/${local.name_prefix}-migration"

  tags = local.common_tags
}
```

`schema.prisma` のパスはビルド成果物の構造に合わせて要調整。`apps/api/Dockerfile` の現状では `dist/prisma/schema.prisma` が無く、`prisma generate` 用に schema を runner stage にコピーする必要がある。次の改修を Dockerfile に追加:

```dockerfile
# runner stage に追加
COPY --chown=node:node --from=builder /app/apps/api/src/prisma/schema.prisma ./prisma/schema.prisma
COPY --chown=node:node --from=builder /app/apps/api/src/prisma/migrations ./prisma/migrations
```

そして command を:

```hcl
command = [
  "node_modules/.bin/prisma",
  "migrate", "deploy",
  "--schema=prisma/schema.prisma",
]
```

シード投入用に別 task definition variant が欲しい場合は、`command` を `["node", "dist/prisma/seed.js"]` にしたモジュール呼び出しを追加。

### 7. outputs

```hcl
output "ecs_cluster_arn" {
  value = module.ecs_cluster.cluster_arn
}

output "ecs_api_service_name" {
  value = module.ecs_api.service_name
}

output "ecs_worker_service_name" {
  value = module.ecs_worker.service_name
}

output "ecs_migration_task_definition_arn" {
  value = module.ecs_migration.task_definition_arn
}

output "api_fqdn" {
  value = module.route53.fqdn_api
}
```

## 動作確認

```bash
cd infra/terraform/aws/env/dev
terraform plan
terraform apply
```

このタイミングではまだ ECR にイメージが push されていないため、ECS task は `CannotPullContainerError` で起動失敗する。step8 でイメージを push してから service が安定する。

- リソース確認:

```bash
# task definition の作成確認
aws ecs describe-task-definition \
  --task-definition sns-battle-dev-migration \
  --query 'taskDefinition.containerDefinitions[0].command'

# service の状態
aws ecs describe-services \
  --cluster sns-battle-dev-cluster \
  --services sns-battle-dev-api sns-battle-dev-worker \
  --query 'services[*].[serviceName,desiredCount,runningCount,pendingCount]' \
  --output table
```

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| Service が `task failed to start` | step8 でイメージ push 前は当然失敗。step8 完了後に `update-service --force-new-deployment` |
| `ResourceInitializationError: unable to pull secrets` | execution_role に `secretsmanager:GetSecretValue` が無い。step3 で付与したか確認 |
| `task definition revision の重複` | apply 毎に新しい revision が作られる。古い revision は手動削除で OK |
| 既存 ECS service との競合 | 既存 `module.ecs` の service が同名で残っている。`terraform state rm module.ecs.aws_ecs_service.xxx` で外す、または service 名を変える |
