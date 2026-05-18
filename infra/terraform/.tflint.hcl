plugin "terraform" {
  enabled = true
  preset  = "recommended"
}

plugin "aws" {
  enabled = true
  version = "0.40.0"
  source  = "github.com/terraform-linters/tflint-ruleset-aws"
  # deep_check は AWS API への問い合わせが必要で OIDC credentials を要求する。
  # 現状 dev GitHub Environment の OIDC 設定が PR から credentials を取れない問題があるため一旦無効化。
  # 設定が解決したら true に戻すこと（terraform-ci.yml の tflint ジョブから OIDC ステップは削除済み）
  deep_check = false
}
