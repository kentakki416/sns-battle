# matching-worker

Phase 4 マッチング機能の **BullMQ ジョブ消化専用ワーカー**。`apps/api` から enqueue された delayed job を消化し、テーマ進行 / セッション終了 / LiveKit Webhook の副作用を非同期に処理する。

## 役割

| Queue | ジョブ種別 | 概要 |
|-------|-----------|------|
| `theme-progress` | `advance-theme` / `publish-timer` / `session-timeout` | セッション内のテーマ進行・残り時間配信・10分タイムアウト |
| `webhook-events` | `livekit-event` | LiveKit Webhook（`participant_left` / `room_finished` 等）の処理 |

step0 時点では各ジョブハンドラはログ出力のみのスタブ。実装は step8（theme-progress）/ step9（webhook-events）で行う。

## ディレクトリ構成

```
apps/matching-worker/
├── package.json
├── tsconfig.json / tsconfig.build.json
├── eslint.config.js
├── Dockerfile
├── .env.local             (dotenvx 暗号化、ルートの .env.keys を symlink)
└── src/
    ├── index.ts           ← エントリポイント。Worker を起動 + graceful shutdown
    ├── client/
    │   └── redis.ts       ← BullMQ 専用 Redis client (maxRetriesPerRequest: null)
    ├── jobs/
    │   ├── advance-theme.ts
    │   ├── publish-timer.ts
    │   ├── session-timeout.ts
    │   └── livekit-event.ts
    ├── log/
    │   └── index.ts       ← pino ロガー
    └── workers/
        ├── theme-progress-worker.ts
        └── webhook-events-worker.ts
```

## Commands

```bash
pnpm dev          # tsx watch で起動
pnpm build        # dist/ にコンパイル
pnpm start        # dist/ から起動
pnpm lint         # ESLint
```

## 環境変数（dotenvx）

`apps/api` と同じ鍵ペアで暗号化。`apps/matching-worker/.env.keys` はルートの `.env.keys` へのシンボリックリンク。

| キー | 用途 |
|------|------|
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | BullMQ + Pub/Sub 用 Redis |
| `LIVEKIT_HOST` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | step9 で使用（Webhook 処理 + Data Channel 配信） |
| `DATABASE_URL` | step8 / step9 で Prisma 経由のセッション更新に使用 |

## 設計参照

- `docs/spec/matching/README.md` - アーキテクチャ全体図
- `docs/spec/matching/step0-prereq-services-and-queue.md` - 本パッケージの導入経緯
- `docs/spec/matching/step8-server-theme-timer.md` - テーマ進行ジョブの実装
- `docs/spec/matching/step9-server-livekit-webhook.md` - Webhook ジョブの実装
