# infra/terraform

AWS デプロイ用の Infrastructure as Code (Terraform)。

## 構造

```
aws/
├── bootstrap/    # S3 backend + DynamoDB state lock
├── env/          # 環境別設定（dev / staging / prod）
└── modules/      # 再利用可能な Terraform モジュール
```

## Commands

```bash
cd aws/env/dev
terraform init    # 初回のみ
terraform plan    # 変更プレビュー
terraform apply   # デプロイ
terraform destroy # 削除

# Lint / Validate
terraform fmt -check -recursive -diff
terraform validate
tflint --init
tflint --chdir=aws/env/dev --config=$(pwd)/.tflint.hcl --recursive
trivy config aws/env/dev -c .trivy.yml
```

## 注意事項

- **AWS CLI で `aws configure` を済ませた上で実行**する
- Terraform state は S3 + DynamoDB ロック構成（bootstrap で構成済み）
- `tflint` および `trivy` でセキュリティ/ポリシーチェックを行う
