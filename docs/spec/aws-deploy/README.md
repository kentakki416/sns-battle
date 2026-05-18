# AWS デプロイ（Vercel + AWS ハイブリッド構成）

## 目次

- [背景・目的](#背景目的)
- [スコープ](#スコープ)
- [全体構成](#全体構成)
  - [構成図](#構成図)
  - [責務分担](#責務分担)
- [AWS リソース一覧](#aws-リソース一覧)
- [既存 Terraform からの差分](#既存-terraform-からの差分)
- [ネットワーク設計](#ネットワーク設計)
- [HTTPS / ドメイン設計](#https--ドメイン設計)
- [機密情報の取り扱い](#機密情報の取り扱い)
- [Vercel との連携](#vercel-との連携)
- [LiveKit Cloud との連携](#livekit-cloud-との連携)
- [SSE / WebRTC 固有の留意点](#sse--webrtc-固有の留意点)
- [Prisma マイグレーション戦略](#prisma-マイグレーション戦略)
- [CI/CD](#cicd)
- [動作確認シナリオ](#動作確認シナリオ)
- [実装ステップ](#実装ステップ)
- [コスト概算（dev）](#コスト概算dev)
  - [単価まとめ（東京リージョン）](#単価まとめ東京リージョン)
  - [24/7 稼働の月額（最小構成、730 時間/月）](#247-稼働の月額最小構成730-時間月)
  - [検証時のみ起動した場合（月 30 時間 = 平日 1.5 時間 × 20 日）](#検証時のみ起動した場合月-30-時間--平日-15-時間--20-日)
  - [無料枠でどこまで賄えるか](#無料枠でどこまで賄えるか)
  - [結論](#結論)
- [将来構想](#将来構想)
- [注意事項](#注意事項)

---

## 背景・目的

ローカル `pnpm dev` ではマッチング機能（Phase 4 + Phase 6 MBTI 最適化）まで動作するが、**複数人での実機検証ができていない**。

- ngrok / Cloudflare Tunnel の検討結果: 無料 URL の都度変更、OAuth / LiveKit Webhook の都度再登録、cookie / SameSite の罠が多く、検証のたびに数分の手戻りが発生して継続検証に向かない
- 既に `infra/terraform/aws/` で IaC を管理しているため、AWS 側に dev 環境を常設するのが運用しやすい
- 一方で web フロントは Vercel の Preview URL / Production URL を活用したいので、**web のみ Vercel、API / DB / Redis / Worker は AWS** というハイブリッド構成を採用する

既存の `docs/spec/infrastructure.md` は将来構想として「Web も ECS Fargate」前提で書かれているが、本ドキュメントは **「今すぐ複数人検証ができる dev 環境を立ち上げる」具体的なデプロイ計画** を扱う。

## スコープ

| 対象 | 内容 |
|---|---|
| 環境 | `dev` のみ（staging / prod は本ドキュメントの対象外） |
| 機能 | 既実装の Phase 1〜6 全機能（認証、プロフィール、マッチング、ソーシャル） |
| WebRTC | LiveKit Cloud に任せる（AWS 側に TURN / SFU は載せない） |
| スケーリング | 最小構成 1 task × 各サービス。HPA / Auto Scaling は対象外 |
| 可用性 | Multi-AZ は ALB のみ（RDS は Single-AZ、ElastiCache は 1 ノード） |
| 監視 | CloudWatch Logs への出力まで。アラート / メトリクス収集は対象外 |
| ロードテスト | 対象外 |

## 全体構成

### 構成図

```
                          ┌──────────────────┐
                          │     User         │
                          └────────┬─────────┘
                                   │ HTTPS
            ┌──────────────────────┼─────────────────────────┐
            │                      │                         │
   ┌────────▼─────────┐  ┌────────▼─────────┐    ┌──────────▼──────────┐
   │  Vercel          │  │  LiveKit Cloud   │    │  Route 53           │
   │  (apps/web)      │  │  (WebRTC SFU)    │    │  example.com        │
   └────────┬─────────┘  └────────┬─────────┘    └──────────┬──────────┘
            │ HTTPS                │ Webhook                  │
            │ Server Component /   │ (HTTPS)                  │
            │ Route Handler        │                          │
            ▼                      ▼                          ▼
            ┌────────────────────────────────────────────────────────┐
            │  AWS (ap-northeast-1)                                  │
            │                                                        │
            │   ┌──────────────────┐                                 │
            │   │  ACM 証明書       │                                 │
            │   └────────┬─────────┘                                 │
            │            │                                           │
            │   ┌────────▼──────────┐    Public Subnet (Multi-AZ)    │
            │   │  ALB              │                                │
            │   │  HTTPS:443        │  idle timeout = 3600s          │
            │   │  HTTP:80 → 443    │                                │
            │   └────────┬──────────┘                                │
            │            │                                           │
            │            ▼          Private Subnet (Multi-AZ)        │
            │   ┌──────────────────┐                                 │
            │   │  ECS Fargate     │                                 │
            │   │  - API service   │◄─── Secrets Manager             │
            │   │  - Worker service│◄─── (env injection)             │
            │   │  - Migration task│                                 │
            │   └────┬─────┬───────┘                                 │
            │        │     │                                         │
            │        │     │   Isolated Subnet (Multi-AZ)            │
            │   ┌────▼───┐ ┌▼──────────────┐                         │
            │   │  RDS   │ │ ElastiCache   │                         │
            │   │Postgres│ │ Redis 7       │                         │
            │   └────────┘ └───────────────┘                         │
            │                                                        │
            │   ┌──────────────────┐                                 │
            │   │  NAT Gateway     │  (Private → Internet outbound)  │
            │   └──────────────────┘                                 │
            └────────────────────────────────────────────────────────┘
```

### 責務分担

| コンポーネント | プラットフォーム | 役割 |
|---|---|---|
| `apps/web` | **Vercel** | Next.js 16 SSR / Server Component / Route Handler。ブラウザは Vercel しか直接触らない |
| `apps/api` | **AWS ECS Fargate** | Express REST API + SSE エンドポイント + LiveKit Webhook 受信 |
| `apps/matching-worker` | **AWS ECS Fargate** | BullMQ 消化（テーマ進行 / session-timeout / LiveKit Webhook 副作用処理） |
| Postgres | **AWS RDS** | アプリケーションデータ永続化 |
| Redis | **AWS ElastiCache** | BullMQ + マッチングキュー (Sorted Set) + Pub/Sub + SSE 配信 |
| 機密情報 | **AWS Secrets Manager** | JWT secret / Google OAuth / LiveKit / DB password |
| WebRTC SFU | **LiveKit Cloud** | メディア配信 + TURN（NAT 越え）+ Webhook 送信元 |
| ドメイン / TLS | **AWS Route 53 + ACM** | `api.dev.example.com` の hosted zone + 証明書 |

## AWS リソース一覧

| カテゴリ | リソース | 数 | 補足 |
|---|---|---|---|
| Network | VPC | 1 | 既存（拡張） |
| Network | Public Subnet | 2 AZ | 既存。ALB / NAT Gateway 配置 |
| Network | Private Subnet | 2 AZ | **新規**。ECS task 配置 |
| Network | Isolated Subnet | 2 AZ | **新規**。RDS / ElastiCache 配置 |
| Network | Internet Gateway | 1 | 既存 |
| Network | NAT Gateway | 1 | **新規**。dev はコスト優先で 1 個（本番は AZ 毎） |
| Network | Security Group | 4 | alb（既存）/ ecs（既存）/ rds（新規）/ redis（新規）|
| LB | ALB | 1 | 既存。**HTTPS listener 追加 + idle timeout 3600s** |
| LB | ACM 証明書 | 1 | **新規**。`*.dev.example.com` ワイルドカード |
| DNS | Route 53 hosted zone | 1 | **新規**。AWS で新規ドメイン取得 |
| Compute | ECS cluster | 1 | 既存 |
| Compute | ECS Service: API | 1 | 既存（task definition は secrets 統合のため更新） |
| Compute | ECS Service: matching-worker | 1 | **新規** |
| Compute | ECS Task: migration | 1 | **新規**（one-shot 用、Service には紐付けない） |
| Registry | ECR: api | 1 | 既存 |
| Registry | ECR: matching-worker | 1 | **新規** |
| Registry | ECR: migration | 1 | **新規**（API イメージと同じでも可） |
| DB | RDS for PostgreSQL 16 | 1 | **新規**。db.t4g.micro |
| Cache | ElastiCache Redis 7 | 1 | **新規**。cache.t4g.micro、1 ノード |
| Secrets | Secrets Manager | 1〜n | **新規**。アプリケーション用 1 シークレットに JSON でまとめる |
| State | S3 (tfstate) + DynamoDB | 既存 | 変更なし |

## 既存 Terraform からの差分

`infra/terraform/aws/` の現状と本設計のギャップ:

| モジュール | 現状 | 本設計での更新 |
|---|---|---|
| `modules/vpc` | ✅ subnet_type / NAT 対応済（変数あり） | env/dev の呼び出し側で private / isolated subnet と NAT を有効化 |
| `modules/alb` | HTTP のみ、Blue/Green 構成 | **HTTPS listener 追加** / **idle timeout 3600s** / dev は Blue/Green を一旦 OFF も検討 |
| `modules/ecs` | 単一 service 前提 | **複数 service 対応 + task-only 定義（migration 用）対応** に拡張 |
| `modules/rds` | なし | **新規** |
| `modules/elasticache` | なし | **新規** |
| `modules/secrets` | なし | **新規** |
| `modules/route53` | なし | **新規**（hosted zone + ACM 一式） |
| `bootstrap` | ECR は `sns-battle-server` の 1 つのみ | **`sns-battle-worker` ECR を追加** |

## ネットワーク設計

`apps/web` (Vercel) は AWS の外側にいるため、ALB は **インターネット向け（internet-facing）** を維持する。

```
VPC: 10.0.0.0/16

Public  Subnet A (10.0.1.0/24)    [ap-northeast-1a]  ALB / NAT Gateway
Public  Subnet C (10.0.2.0/24)    [ap-northeast-1c]  ALB
Private Subnet A (10.0.11.0/24)   [ap-northeast-1a]  ECS task (API / worker)
Private Subnet C (10.0.12.0/24)   [ap-northeast-1c]  ECS task
Isolated Subnet A (10.0.21.0/24)  [ap-northeast-1a]  RDS / ElastiCache
Isolated Subnet C (10.0.22.0/24)  [ap-northeast-1c]  RDS / ElastiCache
```

| Security Group | Ingress | Egress |
|---|---|---|
| `alb` | 443 from 0.0.0.0/0、80 from 0.0.0.0/0 | all |
| `ecs` | 8080 from `alb` のみ | all（NAT 経由で outbound） |
| `rds` | 5432 from `ecs` のみ | なし |
| `redis` | 6379 from `ecs` のみ | なし |

`matching-worker` も `ecs` SG を共用するが、ALB に紐付けないため inbound は使われない。

## HTTPS / ドメイン設計

- AWS で新規ドメインを取得（例: `sns-battle-dev.com` 等、任意）→ Route 53 hosted zone が自動作成される
- ACM で `*.dev.<domain>` のワイルドカード証明書を発行（DNS 検証は Route 53 が自動）
- ALB に HTTPS listener を追加し、ACM 証明書をアタッチ
- Route 53 A レコード（ALB の Alias）として `api.dev.<domain>` を作成

これにより:

- ブラウザ → Vercel: 既存の `*.vercel.app` または独自ドメイン
- Vercel → AWS: `https://api.dev.<domain>` で叩く（Server Component / Route Handler / Server Action 経由）
- LiveKit Cloud → AWS: `https://api.dev.<domain>/api/matching/livekit-webhook` を Webhook URL として登録

## 機密情報の取り扱い

ローカルは dotenvx 暗号化だが、本番では使わない。**Secrets Manager + ECS task definition の `secrets:` で環境変数を注入**する。

```
SecretsManager: /sns-battle/dev/app
{
  "DATABASE_URL": "postgresql://...",
  "REDIS_HOST": "...",
  "REDIS_PORT": "6379",
  "REDIS_DB": "0",
  "JWT_ACCESS_SECRET": "...",
  "JWT_REFRESH_SECRET": "...",
  "GOOGLE_CLIENT_ID": "...",
  "GOOGLE_CLIENT_SECRET": "...",
  "LIVEKIT_HOST": "wss://xxx.livekit.cloud",
  "LIVEKIT_API_KEY": "...",
  "LIVEKIT_API_SECRET": "...",
  "LIVEKIT_WEBHOOK_SECRET": "..."
}
```

DB master password / Redis auth token は RDS / ElastiCache 作成時に **Secrets Manager 自動連携**で生成し、上記アプリ用シークレットには Terraform で参照を埋め込む。

ECS task role に `secretsmanager:GetSecretValue` を付与し、task definition では:

```json
{
  "secrets": [
    { "name": "DATABASE_URL", "valueFrom": "arn:aws:secretsmanager:...:secret:/sns-battle/dev/app:DATABASE_URL::" },
    ...
  ]
}
```

の形でキーを 1 つずつマッピングする。

## Vercel との連携

`apps/web` の Vercel Environment Variables（Production / Preview）に以下を設定:

| 変数 | 値 |
|---|---|
| `API_URL` | `https://api.dev.<domain>` |
| `NEXT_PUBLIC_APP_URL` | `https://<vercel-project>.vercel.app` または独自ドメイン |
| `GOOGLE_CLIENT_ID` | （OAuth 公開識別子。API 側と揃える） |

`apps/web/CLAUDE.md` の API 通信ルール（**ブラウザから直接 Express API を fetch しない / 必ず Server Component / Route Handler 経由**）が守られているため、**CORS 設定は不要**（厳密には Server-to-Server なので CORS 制約が発生しない）。

## LiveKit Cloud との連携

LiveKit Cloud のプロジェクト設定で:

1. API Key / Secret を発行 → Secrets Manager に登録
2. **Webhook URL** を `https://api.dev.<domain>/api/matching/livekit-webhook` に設定
3. **Webhook Secret** を発行 → Secrets Manager に登録

apps/api 側の `POST /api/matching/livekit-webhook` で signature 検証 + BullMQ enqueue（実装済み、Phase 4 step9a）。

## SSE / WebRTC 固有の留意点

| 項目 | 対応 |
|---|---|
| **SSE の長時間接続** | ALB の idle timeout を **3600 秒**（既定 60 秒）に設定。サーバー側は 30 秒間隔の heartbeat を既に送信中（Phase 4 step3） |
| **WebRTC メディア** | LiveKit Cloud が SFU + TURN を提供。AWS 側に UDP / STUN / TURN 関連設定は一切不要 |
| **LiveKit Webhook 署名** | livekit-server-sdk の `WebhookReceiver` で検証（実装済み） |
| **Cookie / SameSite** | ブラウザは Vercel ドメインしか触らないため、JWT cookie は Vercel ドメインに対する Secure / HttpOnly / SameSite=Lax で問題なし |
| **Vercel Function timeout** | Server Action / Route Handler で API を呼ぶ場合、Vercel Function timeout（Hobby: 10s, Pro: 60s）に注意。SSE をプロキシしない設計なら問題なし |

## Prisma マイグレーション戦略

**ECS one-shot task** で実行する（ユーザー選択）。

```
GitHub Actions:
  1. apps/api イメージをビルド + ECR push
  2. ECS RunTask（migration task definition）
     - CMD: ["pnpm", "exec", "prisma", "migrate", "deploy", "--schema=src/prisma/schema.prisma"]
     - 環境変数は Secrets Manager から自動注入
  3. 完了を待つ（aws ecs wait tasks-stopped）
  4. API service / worker service を update（new task definition revision）
```

初回の手動マイグレーション時は、ローカルから `aws ecs run-task` を直接叩く。

`apps/api/src/prisma/seed.ts` のシード投入も同じ migration task を流用（CMD を `pnpm db:seed` に切り替えた task definition variant を作成）。

## CI/CD

GitHub Actions（既に OIDC で AWS 接続済み）から:

```yaml
on:
  push:
    branches: [main]
    paths:
      - "apps/api/**"
      - "apps/matching-worker/**"
      - "packages/**"
      - ".github/workflows/deploy-aws.yml"

jobs:
  build-and-deploy:
    - aws-actions/configure-aws-credentials (OIDC)
    - docker buildx で apps/api + apps/matching-worker をビルド
    - ECR ログイン + push（タグ: commit SHA + latest）
    - aws ecs run-task で migration task を実行 + 完了待ち
    - aws ecs update-service --force-new-deployment で 2 サービスを更新
    - service stable まで待つ
```

Vercel 側は Vercel 標準の Git 連携で自動デプロイ。AWS 側のデプロイと独立。

## 動作確認シナリオ

詳細は `step10-verification.md`。

1. AWS デプロイ完了後、`https://api.dev.<domain>/api/health` が 200 を返すこと
2. Vercel の本番 URL から sign-in → onboarding → `/matching` ロビーが表示されること
3. **2 ブラウザ（または別端末）で別アカウントを開き、両方が `/matching` で「マッチング開始」**
4. 数秒以内に matched イベントが SSE で配信され、両者が `/matching/session` でカウントダウン → ACTIVE 遷移
5. テーマ進行が 1 分ごとに発火、リアクション送信、紙吹雪、スタンプ送信、終了で `/matching/result` 到達
6. CloudWatch Logs に api / worker のログが流れていること

## 実装ステップ

実装は **下から順に依存しているため、step1 → step10 の順で進める**。各 step の詳細は対応する `step{n}-*.md` を参照。

| Step | ファイル | 内容 |
|---|---|---|
| 1 | [step1-terraform-network.md](./step1-terraform-network.md) | env/dev の VPC 呼び出しに private / isolated subnet と NAT Gateway を追加、RDS / Redis 用 SG を新設 |
| 2 | [step2-terraform-route53-acm.md](./step2-terraform-route53-acm.md) | ドメイン取得 + Route 53 hosted zone + ACM ワイルドカード証明書 |
| 3 | [step3-terraform-secrets.md](./step3-terraform-secrets.md) | Secrets Manager にアプリ用シークレットを作成、ECS task role に GetSecretValue 付与 |
| 4 | [step4-terraform-rds.md](./step4-terraform-rds.md) | RDS for PostgreSQL 16 を isolated subnet に作成、DATABASE_URL を Secrets Manager に書き込み |
| 5 | [step5-terraform-elasticache.md](./step5-terraform-elasticache.md) | ElastiCache Redis 7 を isolated subnet に作成、REDIS_HOST/PORT を Secrets Manager に書き込み |
| 6 | [step6-terraform-alb-https.md](./step6-terraform-alb-https.md) | ALB に HTTPS listener 追加、idle timeout 3600s、Route 53 A レコードで `api.dev.<domain>` 公開 |
| 7 | [step7-terraform-ecs-services.md](./step7-terraform-ecs-services.md) | ECS module 拡張（複数 service 対応）、API service の secrets 統合、worker service + migration task definition 追加 |
| 8 | [step8-github-actions-deploy.md](./step8-github-actions-deploy.md) | `.github/workflows/deploy-aws.yml` を作成、ECR push + migration RunTask + service update を一連で実行 |
| 9 | [step9-vercel-livekit-config.md](./step9-vercel-livekit-config.md) | Vercel に env を設定、LiveKit Cloud project + Webhook 設定、Google OAuth に Vercel URL 追加 |
| 10 | [step10-verification.md](./step10-verification.md) | 2 ブラウザでのマッチング動作確認、CloudWatch Logs 確認、トラブルシュート |

## コスト概算（dev）

ap-northeast-1（東京）、2026 年 5 月時点の試算。各サービスの単価は **末尾の公式ソース** を参照したものを使用。

### 単価まとめ（東京リージョン）

| サービス | 単価 | ソース |
|---|---|---|
| Fargate Linux/x86 | **$0.05056 / vCPU-時間**、**$0.00553 / GB-時間** | [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)（東京は US East の +25%）|
| RDS db.t4g.micro PostgreSQL Single-AZ | **約 $0.026 / 時間**（≈ $19/月） | [Amazon RDS for PostgreSQL Pricing](https://aws.amazon.com/rds/postgresql/pricing/) |
| RDS gp3 ストレージ | **$0.115 / GB-月**（東京）| [Amazon RDS Pricing](https://aws.amazon.com/rds/pricing/) |
| ElastiCache cache.t4g.micro Redis | **$0.020 / 時間**（≈ $14.60/月）| [Amazon ElastiCache Pricing](https://aws.amazon.com/elasticache/pricing/) |
| ALB | **$0.0243 / 時間** + **$0.008 / LCU-時間** | [Elastic Load Balancing Pricing](https://aws.amazon.com/elasticloadbalancing/pricing/) |
| **NAT Gateway** | **$0.062 / 時間** + **$0.062 / GB処理** | [Amazon VPC Pricing](https://aws.amazon.com/vpc/pricing/) / [NAT GW Pricing Docs](https://docs.aws.amazon.com/vpc/latest/userguide/nat-gateway-pricing.html) |
| Route 53 hosted zone | **$0.50 / zone / 月**（先頭 25 個） | [Amazon Route 53 Pricing](https://aws.amazon.com/route53/pricing/) |
| Route 53 DNS クエリ | **$0.40 / 100 万クエリ**（先頭 10 億）| 同上 |
| Route 53 .com ドメイン登録 | **$13 / 年** | 同上 |
| Secrets Manager | **$0.40 / secret / 月** + **$0.05 / 10,000 API calls** | [AWS Secrets Manager Pricing](https://aws.amazon.com/secrets-manager/pricing/) |
| CloudWatch Logs | **$0.50 / GB 取り込み** + **$0.03 / GB-月 保管**（最初の 5GB は無料枠）| [Amazon CloudWatch Pricing](https://aws.amazon.com/cloudwatch/pricing/) |
| ECR 私的レジストリ | **$0.10 / GB-月**（最初の 500 MB は新規アカウントで 1 年無料）| [Amazon ECR Pricing](https://aws.amazon.com/ecr/pricing/) |
| ACM 証明書 | **無料** | [AWS Certificate Manager Pricing](https://aws.amazon.com/certificate-manager/pricing/) |

Tokyo の Fargate / ALB / RDS の単価は AWS 公式ページが US East 例示のみで region pivot が読みづらいため、**Tokyo の倍率（US の +25% 程度が定常）** を反映した広く使われている値を採用している。誤差はあり得るので、最終確定値は [AWS Pricing Calculator](https://calculator.aws/) でクロスチェックすること。

### 24/7 稼働の月額（最小構成、730 時間/月）

| サービス | スペック / 計算 | 月額 |
|---|---|---|
| Fargate: API | 0.25 vCPU + 0.5 GB × 730h<br>= (0.05056×0.25 + 0.00553×0.5) × 730 | **$11.24** |
| Fargate: matching-worker | 同上 | **$11.24** |
| RDS db.t4g.micro PostgreSQL Single-AZ | 730h × $0.026 | **$18.98** |
| RDS gp3 ストレージ 20GB | 20 × $0.115 | **$2.30** |
| RDS バックアップ（DB と同サイズまで無料） | | **$0** |
| ElastiCache cache.t4g.micro Redis × 1 ノード | 730h × $0.020 | **$14.60** |
| ALB | 730h × $0.0243 | **$17.74** |
| ALB LCU（軽負荷想定 1 LCU 未満）| | ~$1 |
| **NAT Gateway** | 730h × $0.062 | **$45.26** |
| NAT データ処理 | ~5GB × $0.062 | ~$0.31 |
| Route 53 hosted zone | 1 × $0.50 | **$0.50** |
| Route 53 クエリ | 数万クエリ | < $0.10 |
| Secrets Manager | 1 secret + API call 微量 | ~$0.45 |
| CloudWatch Logs | 2-3 GB / 月（5 GB 無料枠内）| **$0** |
| ECR ストレージ | < 500 MB（無料枠内、1 年）| **$0** |
| ドメイン .com | $13 / 年 ÷ 12 | **$1.08** |
| **AWS 小計** | | **≈ $125/月** |
| Vercel Hobby | 無料枠内（後述）| **$0** |
| LiveKit Cloud Build | 無料枠内（後述）| **$0** |
| **総計** | | **≈ $125/月** |

**最大の費目は NAT Gateway（$45/月、全体の 36%）**。次いで RDS（$19）、ALB（$18）、Fargate × 2（$22.5）、Redis（$14.6）の順。

### 検証時のみ起動した場合（月 30 時間 = 平日 1.5 時間 × 20 日）

`terraform destroy` で消すか、または ECS service の `desired_count = 0` + RDS stop + ElastiCache 削除 で課金を止めた場合。

| 時間課金リソース | 30h での課金 |
|---|---|
| Fargate × 2 | $0.92 |
| RDS db.t4g.micro | $0.78 |
| ElastiCache | $0.60 |
| ALB | $0.73 |
| NAT Gateway | $1.86 |
| **時間課金 小計** | **$4.89** |

| 固定 / ストレージ系（停止しても発生） | 月額 |
|---|---|
| Route 53 hosted zone | $0.50 |
| Secrets Manager | $0.45 |
| ドメイン | $1.08 |
| RDS storage（停止中も課金）| $2.30 |
| **固定 小計** | **$4.33** |

**月額合計: 約 $9.22**（24/7 の $125 → 30h で $9 まで圧縮可能）。**完全に destroy** すれば月 $1.58（ドメイン + Route 53 のみ）。

### 無料枠でどこまで賄えるか

| サービス | 無料枠 | 検証用途で十分？ |
|---|---|---|
| **Vercel Hobby**（個人用途）| 100 GB 転送 / 1M Functions invocation / 1M Edge Requests / 4 時間 Function Active CPU [pricing](https://vercel.com/pricing) | ✅ **十分**（dev 検証なら 1% も使わない）。**ただし商用利用は Hobby 規約違反**で、商用なら Vercel Pro $20/user/月が必要 |
| **LiveKit Cloud Build**（無料）| 5,000 WebRTC 接続分 / 月、50 GB 下り、100 同時接続 [pricing](https://livekit.com/pricing) | ✅ **十分**。2 人 × 10 分セッション = 20 分消費、250 セッション分の余裕。50 GB ≈ 1:1 通話 1,600 回 |
| **AWS Free Tier（pre-2025-07-15 アカウント、12 ヶ月レガシー）** | RDS db.t3/t4g.micro **750 時間/月**、CloudWatch Logs **5 GB/月**、ECR private **500 MB/月** [free tier](https://aws.amazon.com/free/) | △ **RDS のみカバー**（$19/月浮く）。ElastiCache の t4g.micro は無料枠対象外（t3.micro のみ）、Fargate / ALB / NAT は対象外 |
| **AWS Free Tier（post-2025-07-15 アカウント、新方式）**| **$200 クレジット / 6 ヶ月有効**（時間ベース無料枠は廃止）[announcement](https://aws.amazon.com/about-aws/whats-new/2025/07/aws-free-tier-credits-month-free-plan/) | △ **1.6 ヶ月分の費用** をカバー。それ以降は通常課金。6 ヶ月後にアカウント停止リスク |

### 結論

| シナリオ | 月額目安 |
|---|---|
| AWS dev を 24/7 稼働（**新規アカウント、無料クレジット消化後**）| **$125/月** |
| AWS dev を 24/7 稼働（**レガシー無料枠アカウント、RDS が無料**）| **$106/月** |
| 検証時のみ起動（月 30 時間）| **約 $9/月** |
| 検証完了後 destroy（hosted zone とドメインのみ残す）| **$1.58/月** |
| Vercel + LiveKit のみ | **$0**（無料枠内、非商用）|

**ベストプラクティス**:
- **検証する日にだけ `terraform apply`、終わったら `terraform destroy`** が dev では最も賢い（月 $5-10 で済む）
- どうしても 24/7 必要なら、まず **VPC Endpoint で NAT Gateway 経由のトラフィックを削減**すると NAT データ処理費が下がる（ECR / Secrets Manager / CloudWatch Logs を Endpoint 経由に切り替えると月 $5-10 浮く）
- 本番化したら **RDS Reserved Instance（1 年で 40% オフ）** で固定費を圧縮
- 検証段階の RDS は **Single-AZ + バックアップ最小** が前提（本番では Multi-AZ で 2 倍）

## 将来構想

- **staging / prod 環境**: 本ドキュメントは dev 限定。staging / prod は `env/staging/`, `env/prod/` を別 backend で切り、Multi-AZ RDS / Redis、HPA、Auto Scaling を追加
- **WAF**: ALB に AWS WAF を載せ、SQL Injection / XSS / Rate Limit
- **CloudWatch Alarms**: API 5xx 率、ECS task 異常終了、RDS / Redis CPU 高負荷
- **APM**: Datadog / New Relic / OpenTelemetry の導入
- **Bastion**: SSM Session Manager 経由の踏み台を1台用意し、RDS 直接アクセスでのデバッグや手動マイグレーション fallback に使う

## 注意事項

- **`DOTENV_PUBLIC_KEY_LOCAL` などローカル専用の暗号鍵を AWS に持ち込まない**。本番では Secrets Manager 統一
- **RDS / ElastiCache の削除保護**: dev でも誤削除すると痛いので `deletion_protection = true` をデフォルトに。検証完了時に明示的に外して destroy
- **NAT Gateway は時間課金で月 $30 以上かかる**ため、放置に注意。検証完了 → destroy のサイクルを意識
- **Vercel の Preview Deploy は毎回 URL が変わる**。dev API は固定 URL なので Vercel 側で `API_URL` を Production / Preview 両方に設定し、Preview からも同じ AWS に向ける
- **LiveKit Cloud の無料枠は月 50 GB**。複数人で長時間検証する場合は枠を意識
- **Google OAuth は authorized redirect URI に Vercel URL を追加**する必要がある（API 側は OAuth callback を発行しないため AWS の URL は登録不要）
- **既存 `infrastructure.md` との関係**: 既存は将来構想（Web も AWS）。本ドキュメントが現時点の dev 構成として正
