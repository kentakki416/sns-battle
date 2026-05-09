# step0-prereq-services-and-queue.md

Phase 4 マッチング機能の **前提となるサービス分離とキュー基盤** を整備する。`apps/matching-worker` パッケージの新設、BullMQ 導入、共有 queue ライブラリの作成、ローカル dev 起動、ECS task 設計のドラフトまでを行う。

設計詳細は `docs/spec/matching/README.md` の [アーキテクチャ](./README.md#アーキテクチャ) を参照。

依存: なし（matching の他 step より先に実施する）。

## 対応内容

### `apps/matching-worker` パッケージ新規作成

```
apps/matching-worker/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── eslint.config.js
├── Dockerfile
├── .env.local         (dotenvx 暗号化、ルートの .env.keys を symlink)
└── src/
    ├── index.ts        ← エントリポイント。Worker を起動 + graceful shutdown
    ├── workers/
    │   ├── theme-progress-worker.ts
    │   └── webhook-events-worker.ts
    ├── jobs/
    │   ├── advance-theme.ts
    │   ├── publish-timer.ts
    │   ├── session-timeout.ts
    │   └── livekit-event.ts
    ├── client/
    │   ├── livekit.ts   ← apps/api の livekit.ts と同一実装（後述）
    │   └── prisma.ts
    └── log/
        └── index.ts
```

`package.json`:

```json
{
  "name": "matching-worker",
  "version": "1.0.0",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc --project tsconfig.build.json",
    "dev": "dotenvx run -f .env.local -- tsx watch src/index.ts",
    "lint": "eslint 'src/**/*.ts'",
    "lint:fix": "eslint 'src/**/*.ts' --fix",
    "start": "dotenvx run -f .env.local -- node dist/index.js",
    "test": "DB_NAME=sns-battle_test dotenvx run -f .env.local -- jest"
  },
  "dependencies": {
    "@prisma/client": "^7.2.0",
    "@repo/api-schema": "workspace:^",
    "@repo/queue": "workspace:^",
    "bullmq": "^5.x",
    "ioredis": "^5.x",
    "livekit-server-sdk": "^2.x",
    "pino": "^10.x"
  }
}
```

`apps/api/CLAUDE.md` の規約（レイヤード / Result 型 / dotenvx）を踏襲する。worker には Service / Repository / Controller のような階層は不要（ジョブ消化に特化）だが、ロジックは `processJob(job): Promise<void>` の関数を切り分けてテスタブルに保つ。

### `packages/queue` パッケージ新規作成（共有 queue 定義）

`apps/api` と `apps/matching-worker` の両方から参照する。queue 名 / ジョブ種別 / payload 型を一元管理。

```
packages/queue/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── theme-progress.ts
    └── webhook-events.ts
```

`packages/queue/src/theme-progress.ts`:

```typescript
import { Queue } from "bullmq"
import type { Redis } from "ioredis"

export const THEME_PROGRESS_QUEUE_NAME = "theme-progress"

export type AdvanceThemeJob = {
  type: "advance-theme"
  sessionId: number
  /** 次に進めるラウンド番号（1〜10） */
  nextRoundNumber: number
}

export type PublishTimerJob = {
  type: "publish-timer"
  sessionId: number
  /** 30 秒ごとの tick index（0, 1, 2, ...）*/
  tickIndex: number
}

export type SessionTimeoutJob = {
  type: "session-timeout"
  sessionId: number
}

export type ThemeProgressJob = AdvanceThemeJob | PublishTimerJob | SessionTimeoutJob

export const createThemeProgressQueue = (redis: Redis): Queue<ThemeProgressJob> =>
  new Queue<ThemeProgressJob>(THEME_PROGRESS_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 5000, type: "exponential" },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  })

/** 決定的 jobId で重複 enqueue を防ぐ */
export const buildAdvanceThemeJobId = (sessionId: number, nextRoundNumber: number): string =>
  `session:${sessionId}:advance:${nextRoundNumber}`

export const buildPublishTimerJobId = (sessionId: number, tickIndex: number): string =>
  `session:${sessionId}:timer:${tickIndex}`

export const buildSessionTimeoutJobId = (sessionId: number): string =>
  `session:${sessionId}:timeout`
```

`packages/queue/src/webhook-events.ts` も同様の構造で `LivekitEventJob`（`event` payload を含む）を定義。

### Redis Client 拡張

`apps/api/src/client/redis.ts` に publisher / subscriber 兼用の既存 client + queue 用 client を整理。BullMQ は `maxRetriesPerRequest: null` を要求するため、queue 用は別インスタンスにする。

```typescript
export const redis = new Redis({ ... })
export const redisSubscriber = new Redis({ ... })  // step3 で追加
export const queueRedis = new Redis({ ..., maxRetriesPerRequest: null })  // 本 step で追加
```

`apps/matching-worker/src/client/redis.ts` も同様。

### `apps/api` 側のキュー enqueue ヘルパー

`apps/api/src/queue/index.ts`（新規）:

```typescript
import { queueRedis } from "../client/redis"
import { createThemeProgressQueue } from "@repo/queue"

export const themeProgressQueue = createThemeProgressQueue(queueRedis)
```

step8 / step9 でこれを使って enqueue する。

### `apps/matching-worker` の Worker 設定

```typescript
// apps/matching-worker/src/workers/theme-progress-worker.ts
import { Worker } from "bullmq"
import { THEME_PROGRESS_QUEUE_NAME, type ThemeProgressJob } from "@repo/queue"
import { advanceTheme } from "../jobs/advance-theme"
import { publishTimer } from "../jobs/publish-timer"
import { sessionTimeout } from "../jobs/session-timeout"
import { queueRedis } from "../client/redis"

export const themeProgressWorker = new Worker<ThemeProgressJob>(
  THEME_PROGRESS_QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
      case "advance-theme": return advanceTheme(job.data)
      case "publish-timer": return publishTimer(job.data)
      case "session-timeout": return sessionTimeout(job.data)
    }
  },
  {
    connection: queueRedis,
    concurrency: 50,  // ジョブ並列数。1 ワーカーで 50 sessions 同時処理可能
  },
)
```

`apps/matching-worker/src/index.ts`:

```typescript
import { themeProgressWorker } from "./workers/theme-progress-worker"
import { webhookEventsWorker } from "./workers/webhook-events-worker"
import { logger } from "./log"

logger.info("matching-worker started")

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down`)
  await Promise.all([
    themeProgressWorker.close(),
    webhookEventsWorker.close(),
  ])
  process.exit(0)
}
process.on("SIGTERM", () => shutdown("SIGTERM"))
process.on("SIGINT", () => shutdown("SIGINT"))
```

### turbo.json への追加

```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"] },
    "dev": { "cache": false, "persistent": true }
  }
}
```

ルートの `pnpm dev` で `apps/matching-worker` も並行起動するよう turborepo に組み込む。

### Dockerfile

```dockerfile
# apps/matching-worker/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY pnpm-lock.yaml package.json ./
COPY apps/matching-worker/package.json apps/matching-worker/
COPY packages packages
RUN corepack enable pnpm && pnpm install --frozen-lockfile

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN corepack enable pnpm && pnpm --filter matching-worker build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/apps/matching-worker/dist ./apps/matching-worker/dist
COPY --from=builder /app/node_modules ./node_modules
CMD ["node", "apps/matching-worker/dist/index.js"]
```

`apps/api` の Dockerfile を参考にビルド構成を合わせる。

### 環境変数

`matching-worker` の `.env.local`（dotenvx 暗号化）に以下を設定:

```bash
DATABASE_URL=...
REDIS_HOST=localhost
REDIS_PORT=6379
LIVEKIT_HOST=...
LIVEKIT_API_KEY=...
LIVEKIT_API_SECRET=...
```

ルート直下の `.env.keys` を `apps/matching-worker/.env.keys` にシンボリックリンクで張る（既存 `apps/api` と同じパターン）。

### ECS Task 設計（インフラ用ドラフト）

`infra/terraform/` 配下に将来追加するモジュールのドラフト:

| Task | 役割 | スケール設定 |
|------|------|-----------|
| `api-task` | apps/api（REST + SSE + Webhook 受信） | desired=2、max=20。CPU 50% 超で scale out |
| `matching-worker-task` | apps/matching-worker | desired=2、max=10。BullMQ の queue depth で scale out |

ALB は api-task のみに振り分ける。matching-worker は ALB 配下に置かない（外部リクエストを受けない）。

## 動作確認

### Lint / Build

```bash
cd apps/matching-worker && pnpm lint && pnpm build
cd packages/queue && pnpm build
```

### 起動確認

```bash
# turbo dev で全サービス並行起動
pnpm dev
```

- `apps/api` が port 8080 で起動
- `apps/matching-worker` がジョブ待機中のログを出力
- 何もジョブが無くても落ちずに常駐すること

### ジョブ enqueue / 消化のスモークテスト

`apps/api/src/index.ts` に一時的にスモークテスト用エンドポイント `POST /api/_debug/enqueue-test-job` を作って、worker が消化することを確認する（PR マージ前に削除）。

```typescript
// debug only
app.post("/api/_debug/enqueue-test-job", async (req, res) => {
  await themeProgressQueue.add(
    "publish-timer",
    { type: "publish-timer", sessionId: 1, tickIndex: 0 },
    { delay: 5000, jobId: buildPublishTimerJobId(1, 0) },
  )
  res.json({ enqueued: true })
})
```

worker のログに 5 秒後にジョブ受信が表示されれば OK。

## 既知の未対応 / 後続 step に持ち越し

- ECS Task 定義（terraform）は別 PR で着手。本 step では Dockerfile と起動手順のみ
- Redis Cluster 化は Spec1 リリース後の負荷見定め後に判断
- BullMQ Dashboard（`@bull-board/express`）は monitoring 用に将来導入。Spec1 では CloudWatch Logs で代替
