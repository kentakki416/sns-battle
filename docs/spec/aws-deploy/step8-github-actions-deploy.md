# step8: GitHub Actions による CI/CD パイプライン

`apps/api` と `apps/matching-worker` のコンテナイメージをビルド → ECR push → migration RunTask → ECS service update を一連のワークフローで実行する。

GitHub OIDC 連携は bootstrap で構成済み（`infra/terraform/aws/bootstrap/github_oidc.tf`）。

## 対応内容

### 1. OIDC role の権限拡張

bootstrap の `github_oidc.tf` で作成された role に、以下の権限が必要:

- ECR: `BatchGetImage`, `PutImage`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `GetAuthorizationToken`
- ECS: `RegisterTaskDefinition`, `UpdateService`, `DescribeServices`, `RunTask`, `DescribeTasks`
- IAM: `PassRole`（task_execution_role / task_role を ECS に渡すため）
- CloudWatch Logs: `FilterLogEvents`（migration ログ取得用）

既存の policy に追加。bootstrap の Terraform で管理されているので、bootstrap apply 後に env/dev は再 apply 不要。

### 2. ワークフローファイルを新規作成

`.github/workflows/deploy-aws-dev.yml`:

```yaml
name: Deploy to AWS dev

on:
  push:
    branches: [main]
    paths:
      - "apps/api/**"
      - "apps/matching-worker/**"
      - "packages/**"
      - "infra/terraform/aws/**"
      - ".github/workflows/deploy-aws-dev.yml"
  workflow_dispatch:

permissions:
  id-token: write
  contents: read

env:
  AWS_REGION: ap-northeast-1
  ECR_API_REPO: sns-battle-server
  ECR_WORKER_REPO: sns-battle-worker
  ECS_CLUSTER: sns-battle-dev-cluster
  ECS_API_SERVICE: sns-battle-dev-api
  ECS_WORKER_SERVICE: sns-battle-dev-worker
  ECS_MIGRATION_TASK_DEF: sns-battle-dev-migration
  PRIVATE_SUBNETS: ${{ secrets.AWS_PRIVATE_SUBNET_IDS }}
  ECS_SECURITY_GROUP: ${{ secrets.AWS_ECS_SECURITY_GROUP_ID }}

jobs:
  build:
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.image_tag }}
    steps:
      - uses: actions/checkout@v4

      - name: Compute image tag
        id: meta
        run: echo "image_tag=${GITHUB_SHA::12}" >> "$GITHUB_OUTPUT"

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr

      - name: Build & push API image
        run: |
          IMAGE=${{ steps.ecr.outputs.registry }}/${{ env.ECR_API_REPO }}
          docker buildx build \
            --platform linux/amd64 \
            -f apps/api/Dockerfile \
            -t "${IMAGE}:${{ steps.meta.outputs.image_tag }}" \
            -t "${IMAGE}:latest" \
            --push \
            .

      - name: Build & push worker image
        run: |
          IMAGE=${{ steps.ecr.outputs.registry }}/${{ env.ECR_WORKER_REPO }}
          docker buildx build \
            --platform linux/amd64 \
            -f apps/matching-worker/Dockerfile \
            -t "${IMAGE}:${{ steps.meta.outputs.image_tag }}" \
            -t "${IMAGE}:latest" \
            --push \
            .

  migrate:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Run Prisma migration
        run: |
          TASK_ARN=$(aws ecs run-task \
            --cluster ${{ env.ECS_CLUSTER }} \
            --task-definition ${{ env.ECS_MIGRATION_TASK_DEF }} \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[${{ env.PRIVATE_SUBNETS }}],securityGroups=[${{ env.ECS_SECURITY_GROUP }}],assignPublicIp=DISABLED}" \
            --query 'tasks[0].taskArn' \
            --output text)

          echo "Migration task ARN: $TASK_ARN"

          aws ecs wait tasks-stopped \
            --cluster ${{ env.ECS_CLUSTER }} \
            --tasks "$TASK_ARN"

          EXIT_CODE=$(aws ecs describe-tasks \
            --cluster ${{ env.ECS_CLUSTER }} \
            --tasks "$TASK_ARN" \
            --query 'tasks[0].containers[0].exitCode' \
            --output text)

          if [ "$EXIT_CODE" != "0" ]; then
            echo "Migration failed with exit code $EXIT_CODE"
            aws logs filter-log-events \
              --log-group-name /ecs/sns-battle-dev-migration \
              --limit 200 \
              --query 'events[*].message' \
              --output text || true
            exit 1
          fi

  deploy:
    needs: [build, migrate]
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_OIDC_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Update API service
        run: |
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_API_SERVICE }} \
            --force-new-deployment

      - name: Update worker service
        run: |
          aws ecs update-service \
            --cluster ${{ env.ECS_CLUSTER }} \
            --service ${{ env.ECS_WORKER_SERVICE }} \
            --force-new-deployment

      - name: Wait for services to stabilize
        run: |
          aws ecs wait services-stable \
            --cluster ${{ env.ECS_CLUSTER }} \
            --services ${{ env.ECS_API_SERVICE }} ${{ env.ECS_WORKER_SERVICE }}
```

### 3. GitHub Secrets / Variables の設定

リポジトリの Settings → Secrets and variables → Actions に登録:

| Secret 名 | 値 |
|---|---|
| `AWS_OIDC_ROLE_ARN` | bootstrap で作成された OIDC role の ARN |
| `AWS_PRIVATE_SUBNET_IDS` | private subnet ID のカンマ区切り（例: `subnet-aaa,subnet-bbb`） |
| `AWS_ECS_SECURITY_GROUP_ID` | ECS task の SG ID |

`subnet_ids` / `sg_id` は `terraform output` で取得:

```bash
cd infra/terraform/aws/env/dev
terraform output -raw private_subnet_ids
terraform output -raw ecs_security_group_id
```

### 4. 初回デプロイの手動実行

初回は GitHub Actions の `workflow_dispatch` で手動起動するのが安心:

1. GitHub → Actions → "Deploy to AWS dev" → "Run workflow"
2. ログを追跡し、ECR push / migration / service update が成功することを確認
3. 失敗時は CloudWatch Logs（`/ecs/sns-battle-dev-api` 等）で詳細を確認

## 動作確認

```bash
# API health check
curl -i https://api.dev.<domain>/

# 200 OK か、authorized 系のエラーが返れば疎通 OK

# ECS service の running count
aws ecs describe-services \
  --cluster sns-battle-dev-cluster \
  --services sns-battle-dev-api sns-battle-dev-worker \
  --query 'services[*].[serviceName,runningCount]'

# CloudWatch Logs
aws logs tail /ecs/sns-battle-dev-api --since 5m
aws logs tail /ecs/sns-battle-dev-worker --since 5m
```

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| `Migration failed with exit code 1` | DATABASE_URL が間違っているか SG 通信不可。CloudWatch Logs `/ecs/sns-battle-dev-migration` を確認 |
| `Migration failed with exit code 137` | OOM。`memory` を 1024 に上げる |
| Service が `(service xxx) failed to launch tasks` | task definition の secrets ARN ミス、または `task_execution_role` の権限不足 |
| `ResourceInitializationError: failed to validate logger args` | CloudWatch Logs group が無い。Terraform で `aws_cloudwatch_log_group` を作っているか確認 |
| デプロイが 10 分以上 stable にならない | health check 失敗。`/api/health` が 200 を返しているか、target group health check path を確認 |
