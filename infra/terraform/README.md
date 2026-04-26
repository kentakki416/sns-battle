## 概要
本プロジェクトのTerraformによるIaCディレクトリ

### 外部ツール
- **[Trivy](https://trivy.dev/)**: Aqua Security製のOSSセキュリティスキャナ。Terraform設定ファイルのミスコンフィグや脆弱性を検出する
- **[TFLint](https://github.com/terraform-linters/tflint)**: Terraform専用のリンター。非推奨構文やプロバイダ固有のルール違反を検出する

## ディレクトリ構成

```
terraform/
├── aws/
│   ├── bootstrap/        # S3バックエンド・DynamoDBステートロック
│   ├── env/
│   │   └── dev/          # 開発環境の設定
│   └── modules/
│       ├── alb/          # Application Load Balancer
│       ├── ecr/          # Elastic Container Registry
│       ├── ecs/          # ECS Fargate クラスター・サービス
│       └── vpc/          # VPC・サブネット・セキュリティグループ
├── .tflint.hcl           # TFLint設定
├── .trivy.yml            # Trivy設定
└── README.md
```

## クイックスタート

### 必要なツールのインストール

```bash
brew install terraform tflint trivy
```

### セットアップ

```bash
# AWS認証（管理者からシークレット情報を取得して設定）
aws configure
export AWS_DEFAULT_REGION="ap-northeast-1"
```

#### 1. Bootstrap（初回のみ）

tfstateを管理するためのS3バケットとDynamoDBテーブルを作成します。

```bash
cd aws/bootstrap

# 1. variables.tf の以下のデフォルト値をプロジェクトに合わせて変更
#    - project_name
#    - s3_bucket_name（AWSグローバルで一意にする）
#    - dynamodb_table_name

# 2. リソースを作成
terraform init
terraform plan
terraform apply
```

#### 2. Backend設定

Bootstrapで作成したリソースを環境側のbackendに反映します。

```bash
cd aws/env/dev

# backend.tf の以下の値をBootstrapで作成した値に更新
#   - bucket（= bootstrap の s3_bucket_name）
#   - dynamodb_table（= bootstrap の dynamodb_table_name）

terraform init
```

#### 3. リソースのデプロイ
リソースをデプロイします。詳細は以下のインフラ図を参照してください。
- [AWS インフラ構成図](./aws-infrastructure.drawio)

```bash
cd aws/env/dev

terraform plan

terrafomr apply
```

## コマンド集

```bash
# --- デプロイ関連 ---
cd aws/env/dev
terraform plan      # 差分検知
terraform apply     # デプロイ
terraform destroy   # 削除

# --- リント・バリデーション ---
terraform fmt -check -recursive -diff                                    # フォーマットチェック
terraform validate                                                       # バリデーション（aws/env/dev内で実行）
tflint --init                                                            # TFLint初期化（初回のみ）
tflint --chdir=aws/env/dev --config=$(pwd)/.tflint.hcl --recursive      # TFLintチェック

# --- セキュリティスキャン ---
trivy config aws/env/dev -c aws/env/dev/.trivy.yml                      # Trivy 脆弱性・ミスコンフィグチェック(devはコスト削減のため、.trivyignoreでいくつかのチェックを無効化している)
trivy config aws/env/prd -c aws/env/dev/.trivy.yml                      # Trivy 脆弱性・ミスコンフィグチェック
```
