# step9: Vercel / LiveKit Cloud / Google OAuth の設定

AWS 側のインフラと API がデプロイされたら、Vercel 上の `apps/web` と LiveKit Cloud / Google OAuth Console を AWS 側に向ける。

## 対応内容

### 1. Vercel プロジェクトの作成

#### a. Vercel CLI でリンク（ローカル）

```bash
cd apps/web
npx vercel link
# プロジェクトを選択 or 新規作成
```

または Vercel Dashboard で GitHub リポジトリを import → root directory を `apps/web` に指定。

#### b. Build & Output 設定

monorepo なので、Vercel の **Root Directory** を `apps/web` に設定する。Build Command と Install Command は以下:

| 項目 | 値 |
|---|---|
| Framework Preset | Next.js |
| Root Directory | `apps/web` |
| Build Command | `cd ../.. && pnpm --filter @repo/api-schema build && pnpm --filter web build` |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile` |
| Output Directory | `.next`（デフォルト） |
| Node.js Version | 20.x |

Turborepo を使うなら `pnpm dlx turbo build --filter=web` でも可。

#### c. Environment Variables を設定

Vercel Dashboard → Project Settings → Environment Variables で以下を **Production / Preview / Development の 3 環境** に登録:

| 変数 | Production | Preview | 値の例 |
|---|---|---|---|
| `API_URL` | ✅ | ✅ | `https://api.dev.<domain>` |
| `NEXT_PUBLIC_APP_URL` | ✅ | ✅ | `https://<project>.vercel.app`（独自ドメインを Vercel に紐付けるなら独自） |
| `GOOGLE_CLIENT_ID` | ✅ | ✅ | OAuth 公開識別子。API 側と揃える |

`API_URL` は dev 1 つしか無い前提で Preview も同じ AWS dev を指す。Preview で別 AWS 環境が必要になったら staging 環境を別途用意する。

#### d. 初回デプロイ

```bash
cd apps/web
npx vercel --prod
```

または main ブランチに push（GitHub 連携で自動デプロイ）。

### 2. Google OAuth Console の更新

Google Cloud Console → API & Services → Credentials → 対象 OAuth client を編集:

**Authorized JavaScript origins**:
- `https://<project>.vercel.app`（または独自ドメイン）

**Authorized redirect URIs**:
- `https://<project>.vercel.app/api/auth/google/callback`（apps/web の Route Handler のパスに合わせる）

API（AWS）側は OAuth の callback を受けないため、AWS URL の登録は不要。

apps/web 側で `apps/api/CLAUDE.md` の認証 API（`POST /api/auth/google`）を Server Action / Route Handler 経由で叩く設計のはず（要確認: `apps/web/src/app/api/auth/` 配下）。Vercel 上で動作する OAuth コールバック関数が AWS API の `POST /api/auth/google` を Server-to-Server で呼ぶ流れになる。

### 3. LiveKit Cloud の設定

#### a. Project 作成

[https://cloud.livekit.io](https://cloud.livekit.io) でアカウント作成 → 新規 Project を作成。リージョンは `Tokyo` を選択。

#### b. API Key 発行

Project Settings → Keys → "Add Key" で API Key を発行。

- `API Key`
- `API Secret`
- `WS URL` (`wss://xxx.livekit.cloud`)

これらを Secrets Manager に登録する（step3 の `TF_VAR_livekit_*` で渡し直して `terraform apply`）。

#### c. Webhook の設定

Project Settings → Webhooks → "Add Webhook":

| 項目 | 値 |
|---|---|
| URL | `https://api.dev.<domain>/api/matching/livekit-webhook` |
| Events | `room_started`, `room_finished`, `participant_joined`, `participant_left` |
| Secret | "Generate" でランダム生成 |

生成された Secret を Secrets Manager の `LIVEKIT_WEBHOOK_SECRET` に登録（`TF_VAR_livekit_webhook_secret` 経由）。

apps/api 側は `livekit-server-sdk` の `WebhookReceiver` で署名検証する（実装済み）。

### 4. シード投入

Migration が走った後、テストユーザー作成のためにシードを流すことが多い。`apps/api/src/prisma/seed.ts` の中身を確認し、必要なら migration task と同じ仕組みでシード用 task を起動:

```bash
# シード用 task definition を作っていない場合、ECS Console から
# 既存の migration task definition を override で起動する:
aws ecs run-task \
  --cluster sns-battle-dev-cluster \
  --task-definition sns-battle-dev-migration \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --overrides '{
    "containerOverrides": [{
      "name": "sns-battle-dev-migration",
      "command": ["node", "dist/prisma/seed.js"]
    }]
  }'
```

恒久的に欲しいなら step7 で `module "ecs_seed"` を追加する。

## 動作確認

### Vercel デプロイ確認

```bash
curl -i https://<project>.vercel.app/
# 200 OK、HTML が返る
```

ブラウザで `/sign-in` を開き、Google OAuth → コールバック → ホームに遷移できることを確認。Vercel Functions ログでエラーが出ていないかチェック:

```bash
npx vercel logs <deployment-url>
```

### LiveKit Webhook 確認

LiveKit Cloud の Project → Webhooks → 過去のイベント送信ログで、`200 OK` が返っていることを確認。

API 側のログ:

```bash
aws logs tail /ecs/sns-battle-dev-api --since 5m | grep livekit-webhook
```

トラブルシュート:

| 症状 | 原因と対応 |
|---|---|
| Vercel ビルドが `Cannot find module '@repo/api-schema'` で失敗 | Build Command で `pnpm --filter @repo/api-schema build` を先に走らせる必要あり |
| OAuth callback で `redirect_uri_mismatch` | Google Console の Authorized redirect URIs と apps/web の callback パスが一致していない |
| `OAuth state mismatch` | cookie の SameSite 設定が問題。`apps/web` の OAuth state cookie 設定を確認 |
| LiveKit Webhook が 403 | `LIVEKIT_WEBHOOK_SECRET` がアプリと LiveKit Cloud で不一致 |
| LiveKit Webhook が 502 | API service が立ち上がっていない or path mismatch |
| マッチング画面で room join 失敗 | `LIVEKIT_HOST` が wss:// で始まっているか、`LIVEKIT_API_KEY/SECRET` が正しいか |
