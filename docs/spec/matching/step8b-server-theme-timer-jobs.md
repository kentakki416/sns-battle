# step8b-server-theme-timer-jobs.md

`apps/matching-worker` 側に `theme-progress` queue の 3 種ジョブ（`advance-theme` / `publish-timer` / `session-timeout`）の実消化処理を実装する。step8a で `apps/api` が enqueue したジョブを受け取り、テーマ配信・タイマー配信・タイムアウト処理を行う。`setTimeout` は使わず、全てのスケジューリングは BullMQ の delayed job で表現する。

設計詳細は `docs/spec/matching/README.md` の [アーキテクチャ - BullMQ ジョブ設計](./README.md#bullmq-ジョブ設計) と [サーバーサイドタイマー管理](./README.md#サーバーサイドタイマー管理) を参照。

依存: step0（apps/matching-worker / packages/queue 導入済）、step1（DB）、step4（LiveKit クライアント設計）、step8a（`POST /api/matching/sessions/:id/start` で enqueue 済）。

## 仕様

- 全ジョブは **冪等**:
  - jobId が同一なら BullMQ が重複追加を捨てる
  - 各ジョブ消化時に session の `status === "ENDED"` を確認し、ENDED なら no-op
- `advance-theme` 消化フロー:
  1. session が ENDED なら no-op
  2. `nextRoundNumber > 10` なら no-op
  3. Redis に `matching:schedule:{sessionId}` が無ければ `buildThemeSchedule()` で生成し保存（TTL 1800 秒）
  4. 該当ラウンドの theme を取得
  5. 2 ラウンド目以降は `matching:hype` を Data Channel に publish → 1.5 秒待機
  6. `matching:theme` を Data Channel に publish
  7. 次ラウンドの `advance-theme` を `delay=durationSeconds*1000` で再 enqueue（10 ラウンド目は再 enqueue しない）
- `publish-timer` 消化フロー:
  1. session が ENDED または `startedAt` が無ければ no-op
  2. 残り時間 = `600 - (now - startedAt)`（秒）
  3. 残り 0 秒以下なら no-op（`session-timeout` が処理する）
  4. `matching:timer` を Data Channel に publish（`remaining_seconds`、`can_end_now=elapsed>=300`）
  5. 30 秒後に次 tick を再 enqueue
- `session-timeout` 消化フロー:
  1. session が ENDED なら no-op
  2. session を `status='ENDED'` / `endReason='TIMEOUT'` に更新
  3. `matching:ended` を Data Channel に publish（`reason: "TIMEOUT"`）
  4. 残ジョブ（`advance-theme(round=1..10)` / `publish-timer(tick=0..19)`）を `removeJob` で掃除
  5. `matching:schedule:{sessionId}` を Redis から削除

## 対応内容

### Redis のテーマスケジュール永続化

session の 10 ラウンド分のテーマシャッフル結果を Redis に保存。worker が再起動しても進行を再開できるよう、決定的なデータとして保持する。

```
Key: matching:schedule:{sessionId}
Type: JSON
Value: [
  { themeId: 5, durationSeconds: 30, speakerUserKey: "user1" },
  { themeId: 12, durationSeconds: 15, speakerUserKey: "user2" },
  ...
]
TTL: 1800 秒（30 分。タイムアウト + 余裕分）
```

最初の `advance-theme(nextRoundNumber=1)` ジョブ消化時に Redis に存在しなければ生成して保存。以降のジョブは Redis から読み込み。

### `apps/matching-worker` の依存追加

worker から DB / LiveKit に触れるため、`apps/matching-worker/package.json` に以下を追加:

```json
{
  "dependencies": {
    "@prisma/adapter-pg": "^7.7.0",
    "@prisma/client": "^7.2.0",
    "@repo/queue": "workspace:^",
    "bullmq": "^5.69.1",
    "ioredis": "^5.10.0",
    "livekit-server-sdk": "^2.15.2",
    "pino": "^10.1.0",
    "pino-pretty": "^13.1.3"
  }
}
```

`apps/api` 側の Prisma schema を共有する方針:

- `apps/matching-worker` 側で別の Prisma schema を持たず、`apps/api/src/prisma/schema.prisma` の生成物を使う
- worker の `package.json` に `db:generate` script を追加して `prisma generate --schema=../api/src/prisma/schema.prisma --output=node_modules/@prisma/client` のように生成先を worker 側にも揃える、または peer 参照する
- 生成先と import 経路は実装時に既存 api と整合する形で詰める（worker 側に重複生成するか、api 側を共有 import するかは検討）

### Repository（worker 用）

`apps/matching-worker/src/repository/prisma/` を新規作成し、worker で必要な最小限のリポジトリだけ実装する。`apps/api` 側の interface / `_toDomain` 変換をコピーするのではなく、必要メソッドのみ切り出す。

#### `MatchingSessionRepository`

worker が必要とするメソッド:

- `findById(id: number): Promise<MatchingSession | null>`
- `markEnded(id: number, reason: "TIMEOUT" | "USER_LEFT" | ...): Promise<void>`

`MatchingSession` ドメイン型は `id` / `user1Id` / `user2Id` / `status` / `startedAt` / `livekitRoomName` / `endReason` を含む。

#### `TalkThemeRepository`

worker が必要とするメソッド:

- `findActiveByCategoryAndType(category: "MATCHING", type: "CHOICE" | "FREE_TALK"): Promise<TalkTheme[]>`
- `findByIdWithChoices(id: number): Promise<TalkThemeWithChoices | null>`

ドメイン型は `id` / `type` / `title` / `duration` / `choices`（`CHOICE` の場合のみ）。

### LiveKit クライアント（worker 用）

`apps/matching-worker/src/client/livekit.ts`（新規）:

- `RoomServiceClient` を内包し、`publishData({ roomName, topic, payload }): Promise<void>` を露出する
- `interface ILiveKitDataPublisher` を切り、worker のジョブには interface 経由で注入（テスト時に `jest.fn()` でモックするため）
- `apps/api` 側にも類似のクライアントが step4 / step9a で存在する。重複コードを許容するか、`packages/livekit-client` のような共有パッケージに切り出すかは実装時に判断（本 step では worker 側に独立実装で OK）

### Job: `advance-theme.ts`

`apps/matching-worker/src/jobs/advance-theme.ts`（既存 stub を置き換え）:

```typescript
import {
  buildAdvanceThemeJobId,
  type AdvanceThemeJob,
  type ThemeProgressJob,
} from "@repo/queue"
import type { Queue } from "bullmq"

const HYPE_COMMENTS = [
  "本当に相手の心つかめたか？",
  "いい感じ！",
  "盛り上がってきた！",
  "次のテーマで勝負！",
  "相性バッチリかも！？",
  "ドキドキの展開！",
  "ここからが本番！",
  "運命の出会いか！？",
] as const

const TOTAL_ROUNDS = 10

export const advanceTheme = async (
  data: AdvanceThemeJob,
  deps: {
    matchingSessionRepository: MatchingSessionRepository
    talkThemeRepository: TalkThemeRepository
    livekitDataPublisher: ILiveKitDataPublisher
    themeProgressQueue: Queue<ThemeProgressJob>
    redis: Redis
  },
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") return
  if (data.nextRoundNumber > TOTAL_ROUNDS) return

  /** Redis にスケジュールがなければ生成 */
  const scheduleKey = `matching:schedule:${data.sessionId}`
  let schedule: ScheduleEntry[] | null = JSON.parse(
    (await deps.redis.get(scheduleKey)) ?? "null",
  )
  if (!schedule) {
    schedule = await buildThemeSchedule({ talkThemeRepository: deps.talkThemeRepository })
    await deps.redis.set(scheduleKey, JSON.stringify(schedule), "EX", 1800)
  }

  const round = schedule[data.nextRoundNumber - 1]
  const theme = await deps.talkThemeRepository.findByIdWithChoices(round.themeId)
  if (!theme) return

  /** 2 ラウンド目以降は hype を先に配信 */
  if (data.nextRoundNumber > 1) {
    const hype = HYPE_COMMENTS[Math.floor(Math.random() * HYPE_COMMENTS.length)]
    await deps.livekitDataPublisher.publishData({
      roomName: session.livekitRoomName,
      topic: "matching:hype",
      payload: { message: hype },
    })
    await new Promise((r) => setTimeout(r, 1500))
  }

  await deps.livekitDataPublisher.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:theme",
    payload: {
      round_number: data.nextRoundNumber,
      theme_id: theme.id,
      type: theme.type,
      title: theme.title,
      choices: theme.choices,
      speaker: round.speakerUserKey,
      duration: round.durationSeconds,
    },
  })

  if (data.nextRoundNumber < TOTAL_ROUNDS) {
    await deps.themeProgressQueue.add(
      "advance-theme",
      {
        type: "advance-theme",
        sessionId: data.sessionId,
        nextRoundNumber: data.nextRoundNumber + 1,
      },
      {
        delay: round.durationSeconds * 1000,
        jobId: buildAdvanceThemeJobId(data.sessionId, data.nextRoundNumber + 1),
      },
    )
  }
}
```

### Job: `publish-timer.ts`

`apps/matching-worker/src/jobs/publish-timer.ts`（既存 stub を置き換え）:

```typescript
import {
  buildPublishTimerJobId,
  type PublishTimerJob,
  type ThemeProgressJob,
} from "@repo/queue"

export const publishTimer = async (
  data: PublishTimerJob,
  deps: {
    matchingSessionRepository: MatchingSessionRepository
    livekitDataPublisher: ILiveKitDataPublisher
    themeProgressQueue: Queue<ThemeProgressJob>
  },
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED" || !session.startedAt) return

  const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
  const remaining = Math.max(0, 600 - elapsed)
  if (remaining === 0) return

  await deps.livekitDataPublisher.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:timer",
    payload: { remaining_seconds: remaining, can_end_now: elapsed >= 300 },
  })

  await deps.themeProgressQueue.add(
    "publish-timer",
    { type: "publish-timer", sessionId: data.sessionId, tickIndex: data.tickIndex + 1 },
    {
      delay: 30_000,
      jobId: buildPublishTimerJobId(data.sessionId, data.tickIndex + 1),
    },
  )
}
```

### Job: `session-timeout.ts`

`apps/matching-worker/src/jobs/session-timeout.ts`（既存 stub を置き換え）:

```typescript
import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  type SessionTimeoutJob,
  type ThemeProgressJob,
} from "@repo/queue"

export const sessionTimeout = async (
  data: SessionTimeoutJob,
  deps: {
    matchingSessionRepository: MatchingSessionRepository
    livekitDataPublisher: ILiveKitDataPublisher
    themeProgressQueue: Queue<ThemeProgressJob>
    redis: Redis
  },
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") return

  await deps.matchingSessionRepository.markEnded(data.sessionId, "TIMEOUT")

  await deps.livekitDataPublisher.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:ended",
    payload: { reason: "TIMEOUT" },
  })

  /** 残ジョブ掃除 */
  await Promise.all([
    ...Array.from({ length: 10 }, (_, i) =>
      deps.themeProgressQueue.removeJob(buildAdvanceThemeJobId(data.sessionId, i + 1)),
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      deps.themeProgressQueue.removeJob(buildPublishTimerJobId(data.sessionId, i)),
    ),
  ])

  await deps.redis.del(`matching:schedule:${data.sessionId}`)
}
```

### `buildThemeSchedule`

`apps/matching-worker/src/jobs/build-theme-schedule.ts`（新規）:

```typescript
type ScheduleEntry = {
  themeId: number
  durationSeconds: number
  speakerUserKey: "user1" | "user2"
}

export const buildThemeSchedule = async (
  deps: { talkThemeRepository: TalkThemeRepository },
): Promise<ScheduleEntry[]> => {
  const choiceThemes = await deps.talkThemeRepository.findActiveByCategoryAndType(
    "MATCHING",
    "CHOICE",
  )
  const freeTalkThemes = await deps.talkThemeRepository.findActiveByCategoryAndType(
    "MATCHING",
    "FREE_TALK",
  )

  const shuffle = <T>(arr: T[]): T[] => arr.slice().sort(() => Math.random() - 0.5)
  const c = shuffle(choiceThemes)
  const f = shuffle(freeTalkThemes)

  const result: ScheduleEntry[] = []
  for (let i = 0; i < 10; i++) {
    const theme = i % 2 === 0 ? f[i % f.length] : c[i % c.length]
    result.push({
      themeId: theme.id,
      durationSeconds: theme.duration,
      speakerUserKey: i % 2 === 0 ? "user1" : "user2",
    })
  }
  return result
}
```

### Worker への DI 配線

`apps/matching-worker/src/workers/theme-progress-worker.ts` を更新し、各 job 呼び出しに `deps` を渡す:

```typescript
import { Worker } from "bullmq"
import { THEME_PROGRESS_QUEUE_NAME, type ThemeProgressJob, createThemeProgressQueue } from "@repo/queue"

import { queueRedis } from "../client/redis"
import { livekitDataPublisher } from "../client/livekit"
import { prisma } from "../client/prisma"
import { PrismaMatchingSessionRepository } from "../repository/prisma/matching-session-repository"
import { PrismaTalkThemeRepository } from "../repository/prisma/talk-theme-repository"
import { advanceTheme } from "../jobs/advance-theme"
import { publishTimer } from "../jobs/publish-timer"
import { sessionTimeout } from "../jobs/session-timeout"

const matchingSessionRepository = new PrismaMatchingSessionRepository(prisma)
const talkThemeRepository = new PrismaTalkThemeRepository(prisma)
const themeProgressQueue = createThemeProgressQueue(queueRedis)

const deps = {
  matchingSessionRepository,
  talkThemeRepository,
  livekitDataPublisher,
  themeProgressQueue,
  redis: queueRedis,
}

export const themeProgressWorker = new Worker<ThemeProgressJob>(
  THEME_PROGRESS_QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
    case "advance-theme":
      return advanceTheme(job.data, deps)
    case "publish-timer":
      return publishTimer(job.data, deps)
    case "session-timeout":
      return sessionTimeout(job.data, deps)
    }
  },
  { concurrency: 50, connection: queueRedis },
)
```

`apps/matching-worker/src/index.ts` のシャットダウン処理に `themeProgressQueue.close()` / `prisma.$disconnect()` を追加。

### 環境変数

worker に以下を追加（`apps/matching-worker/.env.local`）:

- `DATABASE_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `LIVEKIT_URL`
- `REDIS_HOST`
- `REDIS_PORT`
- `REDIS_PASSWORD`
- `REDIS_DB`

`docs/spec/bullmq-dashboard.md` の env 一覧と整合させる。

## 動作確認

### Worker integration テスト（apps/matching-worker）

worker に Jest をセットアップ（`apps/api` の `jest.config.ts` をベースに、test 用 Postgres + Redis + BullMQ で構築）。

`apps/matching-worker/test/jobs/advance-theme.test.ts`:

| ケース | 期待結果 |
|---|---|
| schedule が Redis に無い | `buildThemeSchedule` で生成され、Redis に JSON で保存される |
| nextRoundNumber=1 | `matching:hype` は publish されず `matching:theme` のみ publish |
| nextRoundNumber=2..10 | `matching:hype` → 1.5 秒後に `matching:theme` の順で publish |
| nextRoundNumber<10 | 次ラウンドの `advance-theme` が `delay=durationSeconds*1000` で再 enqueue |
| nextRoundNumber=10 | 再 enqueue されない |
| session が ENDED | no-op（publish も enqueue もされない） |

`apps/matching-worker/test/jobs/publish-timer.test.ts`:

| ケース | 期待結果 |
|---|---|
| session ENDED | no-op |
| `startedAt=null` | no-op |
| 残り > 0 | `matching:timer` を publish、次 tick が 30 秒後に enqueue |
| `elapsed < 300` | `can_end_now=false` |
| `elapsed >= 300` | `can_end_now=true` |
| 残り = 0 | 何も publish されず再 enqueue もされない |

`apps/matching-worker/test/jobs/session-timeout.test.ts`:

| ケース | 期待結果 |
|---|---|
| session 既に ENDED | no-op |
| ACTIVE → ENDED | DB の `status='ENDED'` / `endReason='TIMEOUT'`、`matching:ended` publish、関連ジョブが queue から削除（`getJob` が undefined）、Redis の `matching:schedule:{id}` が削除 |

実 BullMQ + 実 Redis（test 用 `REDIS_DB=2`）+ 実 Postgres でテストする。`livekitDataPublisher` のみ `jest.fn()` でモック。

### dev で疎通

```bash
pnpm --filter api dev
pnpm --filter matching-worker dev
# 1) 2 ユーザーで join → match 成立
# 2) POST /api/matching/sessions/:id/start
# 3) matching-worker のログ:
#    - "advance-theme processed (sessionId=1, round=1)"
#    - 30 秒後 "publish-timer processed (tick=0)"
#    - 各 round の duration 秒後 "advance-theme processed (round=2)"
#    - 10 分後 "session-timeout processed"
# 4) LiveKit Cloud のダッシュボードで Room 内 Data Channel メッセージを確認
# 5) DB の matching_sessions.status='ENDED' / endReason='TIMEOUT'
```

## 既知の未対応 / 後続 step に持ち越し

- worker のメトリクス（処理時間 / 失敗率）は Phase 5 以降の monitoring セットアップで対応
- `matching:hype` の 1.5 秒待機は worker の concurrency を消費する。負荷高では別ジョブに切り出す改善余地あり
- `removeJob` で削除できない active ジョブがあっても、次回消化時に session が ENDED で no-op するので問題ない設計
- worker が処理中に死んだ場合のジョブ復元は BullMQ の `attempts` リトライで対応（既定 3 回 / exponential backoff）
- LiveKit クライアントは現状 worker 側で独立実装。重複コードが増えた段階で `packages/livekit-client` への切り出しを検討
