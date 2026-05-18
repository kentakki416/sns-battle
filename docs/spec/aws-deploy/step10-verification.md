# step10: 動作確認シナリオ

dev 環境構築完了後、複数人で動作確認する手順。

## 対応内容

### 1. 事前準備

- AWS deploy が完了し、ECS API / worker service が `RUNNING`
- Vercel デプロイが完了し、本番 URL がアクセス可能
- LiveKit Cloud の Webhook URL が AWS の ALB を指している
- Google OAuth の redirect URI が Vercel URL に登録済み

### 2. ヘルスチェック

```bash
# API の疎通
curl -i https://api.dev.<domain>/api/health
# 200 OK + JSON

# Vercel の疎通
curl -i https://<project>.vercel.app/
# 200 OK + HTML
```

### 3. 一人セットアップ（自分の検証用アカウント）

1. ブラウザで `https://<project>.vercel.app` を開く
2. Sign in with Google → OAuth コールバック → onboarding ページに遷移
3. 生年月日 / 性別 / MBTI を入力 → 完了
4. `/profile/edit` で氏名・自己紹介・アバターを設定
5. 自分の `userId` を控えておく（プロフィール URL `https://.../profile/<id>` 末尾、または `GET /api/auth/me` レスポンス）

### 4. 複数人検証の参加者への共有

検証参加者に以下を共有:

```
URL: https://<project>.vercel.app
ログイン: Googleアカウントで sign-in
手順:
  1. /sign-in でログイン
  2. /onboarding で生年月日・性別を入力
  3. /matching でマッチング開始
  4. 数秒以内に他の参加者とマッチング成立
  5. ビデオ通話開始 → 10 分で自動終了
注意:
  - カメラ / マイクの許可が必要
  - ビデオ通話中の通信量は 1 セッションあたり ~50MB
```

### 5. マッチング成立シナリオ

| ステップ | 期待挙動 | 確認方法 |
|---|---|---|
| 1. 2 ユーザーが `/matching` で同時に「開始」ボタン | 即座にマッチング成立、`/matching/session` へ遷移 | ブラウザ画面 |
| 2. countdown 3-2-1-START | 全画面オーバーレイで表示 | ブラウザ画面 |
| 3. ACTIVE 状態 | 両者のビデオが映る、上部にトークテーマカード | ブラウザ画面 |
| 4. 1 分ごとにテーマ切り替え | テーマカード更新、紙吹雪なし | ブラウザ画面 |
| 5. リアクション送信（選択肢タップ） | 自分側にバブル表示、相手と同じ選択肢なら紙吹雪 | ブラウザ画面 |
| 6. スタンプ送信 | 画面にスタンプアニメーション | ブラウザ画面 |
| 7. 5 分経過後の「終了」ボタン | ボタンがアクティブ化、押すと終了 | ブラウザ画面 |
| 8. 10 分自動終了 | `/matching/result` へ遷移 | ブラウザ画面 |
| 9. MBTI 相性スコア表示 | 結果画面に相性が出る（両者の MBTI 設定があれば） | ブラウザ画面 |

### 6. サーバーログでの裏付け確認

```bash
# API service
aws logs tail /ecs/sns-battle-dev-api --follow | grep -E "matching|livekit|SSE"

# matching-worker
aws logs tail /ecs/sns-battle-dev-worker --follow | grep -E "advance-theme|session-timeout|livekit-event"

# LiveKit Webhook 受信
aws logs tail /ecs/sns-battle-dev-api --follow | grep livekit-webhook
```

期待されるログ:

- API: `POST /api/matching/join` × 2 → matched → `POST /api/matching/sessions/:id/start`
- Worker: `advance-theme` job × N（テーマ数）、`session-timeout` job × 1
- Webhook: `room_started`、`participant_joined` × 2、`participant_left` × 2、`room_finished`

### 7. CloudWatch メトリクス確認

```bash
# RDS CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/RDS \
  --metric-name CPUUtilization \
  --dimensions Name=DBInstanceIdentifier,Value=sns-battle-dev-db \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average

# Redis CPU
aws cloudwatch get-metric-statistics \
  --namespace AWS/ElastiCache \
  --metric-name EngineCPUUtilization \
  --dimensions Name=CacheClusterId,Value=sns-battle-dev-redis-001 \
  --start-time $(date -u -v-1H +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average
```

dev の最小構成では数人の同時マッチングなら CPU 10% 未満で収まるはず。

### 8. SSE / Webhook の長時間検証

10 分間 idle で SSE が切れないことを確認:

1. `/matching` でマッチング開始（相手は来ない状態でキュー待ち）
2. ブラウザ DevTools → Network → `/api/matching/events` を確認
3. 30 秒ごとに heartbeat が来ること
4. 5 分以上経過しても接続が切れないこと（ALB idle timeout 3600s が効いている）

### 9. 既知の留意点と対応

| 留意点 | 対応 |
|---|---|
| LiveKit Cloud の無料枠（50GB/月） | Project Dashboard で残量確認。超過しそうなら検証時間を短くする |
| RDS の Maintenance Window | 月 1 回 5〜30 分のメンテで切断あり。検証中に当たらないよう `maintenance_window` の値を確認 |
| dev の単一 NAT Gateway | NAT が落ちると ECS task が outbound 不可。CloudWatch で監視推奨 |
| Vercel Function timeout | Server Action / Route Handler が AWS API に対して長時間 fetch すると Vercel 側がタイムアウト。SSE はブラウザ → AWS 直接接続にする |
| 検証完了後のコスト | `terraform destroy` で消す。NAT / RDS / Redis は時間課金 |

### 10. 後片付け（検証完了時）

検証が一段落して当面使わない場合:

```bash
cd infra/terraform/aws/env/dev

# RDS の deletion_protection を OFF
terraform apply -var "rds_deletion_protection=false" -var "rds_skip_final_snapshot=true"

# 全リソース削除
terraform destroy
```

Vercel 側はそのまま残しても無料枠で動く。LiveKit Cloud も同様（API key 無効化する場合は手動）。

完全に消す場合は:

- Vercel: Project 削除
- LiveKit: Project 削除
- Route 53: ドメインは保持か解約か判断（解約は年単位）
- Secrets Manager: `recovery_window_in_days = 7` のため 7 日後に完全削除

## 動作確認

このドキュメント自体が動作確認手順。

トラブルシュート全体まとめ:

| 症状 | 原因 | 対応 |
|---|---|---|
| sign-in できない | OAuth redirect URI 不一致 | Google Console で Vercel URL を追加 |
| `/matching` が 401 | JWT cookie が落ちている | DevTools Application → Cookies で `sb_access_token` 確認 |
| マッチング成立しない | SSE 接続失敗 or Redis 通信不可 | CloudWatch Logs の API service を確認 |
| ビデオが映らない | LiveKit token 発行失敗 or カメラ permission 拒否 | ブラウザ console + LiveKit Cloud の Sessions 確認 |
| テーマが進まない | matching-worker が落ちている | CloudWatch Logs `/ecs/sns-battle-dev-worker` 確認、ECS service の RUNNING count 確認 |
| Webhook が来ない | LiveKit Cloud の Webhook URL ミス、ALB の HTTPS 不通 | LiveKit Cloud の Webhook ログ確認 |
