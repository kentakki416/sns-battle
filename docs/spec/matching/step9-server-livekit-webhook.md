# step9-server-livekit-webhook.md

LiveKit Cloud からの Webhook を受信する `POST /api/matching/livekit-webhook` を実装する。**API 側は signature 検証 + BullMQ enqueue のみ**で即 200 を返却し、後処理は `apps/matching-worker` の `webhook-events` queue worker が消化する。

設計詳細は `docs/spec/matching/README.md` の [アーキテクチャ - BullMQ ジョブ設計](./README.md#bullmq-ジョブ設計) と [マッチング終了](./README.md#マッチング終了) を参照。依存: step0（matching-worker / queue 基盤）、step1（DB）、step5（endMatchingSession）、step8（theme-progress queue / Redis schedule）。

## 仕様

- 認証: LiveKit signature 検証（Access Token は不要、middleware の `PUBLIC_PATHS` で bypass）
- 受信イベント例: `participant_left`, `room_finished`, `participant_joined`, `track_published` 等
- マッチング機能で処理が必要なのは **`participant_left`** と **`room_finished`** のみ。それ以外は無視
- 処理フロー:
  1. `apps/api`: signature 検証 → BullMQ `webhook-events` queue に `livekit-event` ジョブを enqueue → 即 204 返却
  2. `apps/matching-worker`: ジョブを消化して `participant_left` / `room_finished` の場合のみ session 終了処理（`endMatchingSession(USER_LEFT)`）+ `matching:ended` 配信 + theme-progress queue の関連ジョブ削除
- LiveKit はリトライするため処理は idempotent。session が既に ENDED なら no-op
- ジョブ ID は `livekit:${event.id}`（LiveKit Webhook event の id を使用 → 重複到達でも 1 回のみ実行）

## 対応内容

### packages/queue に webhook-events 追加

`packages/queue/src/webhook-events.ts`（step0 で枠組みは作成済、本 step で具体型を確定）:

```typescript
import { Queue } from "bullmq"
import type { Redis } from "ioredis"
import type { WebhookEvent } from "livekit-server-sdk"

export const WEBHOOK_EVENTS_QUEUE_NAME = "webhook-events"

export type LivekitEventJob = {
  type: "livekit-event"
  /** LiveKit から受け取った WebhookEvent をそのまま JSON シリアライズしたもの */
  event: WebhookEvent
}

export const createWebhookEventsQueue = (redis: Redis): Queue<LivekitEventJob> =>
  new Queue<LivekitEventJob>(WEBHOOK_EVENTS_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { delay: 2000, type: "exponential" },
      removeOnComplete: { age: 86400, count: 10000 },
      removeOnFail: { age: 86400 * 7 },
    },
  })

export const buildLivekitEventJobId = (eventId: string): string => `livekit:${eventId}`
```

### 環境変数

step4 で設定済の `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` を Webhook signature 検証にも使う。`apps/api` と `apps/matching-worker` の両方に `.env.local` で設定。

### `apps/api` 側

#### LiveKit Webhook Receiver

`apps/api/src/client/livekit.ts` に追加:

```typescript
import { WebhookReceiver, type WebhookEvent } from "livekit-server-sdk"

export interface ILiveKitWebhookReceiver {
  /** Express の raw body と Authorization ヘッダから WebhookEvent を返す。署名不正なら null */
  receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null>
}

export class LiveKitWebhookReceiverImpl implements ILiveKitWebhookReceiver {
  private receiver: WebhookReceiver

  constructor(apiKey: string, apiSecret: string) {
    this.receiver = new WebhookReceiver(apiKey, apiSecret)
  }

  async receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null> {
    if (!authHeader) return null
    try {
      return await this.receiver.receive(rawBody, authHeader)
    } catch {
      return null
    }
  }
}
```

#### Controller

`apps/api/src/controller/matching/livekit-webhook.ts`（新規）:

```typescript
import express, { type Request, type Response } from "express"
import { buildLivekitEventJobId, type LivekitEventJob } from "@repo/queue"
import type { Queue } from "bullmq"
import type { ILiveKitWebhookReceiver } from "../../client/livekit"
import { logger } from "../../log"

export class LiveKitWebhookController {
  constructor(
    private readonly receiver: ILiveKitWebhookReceiver,
    private readonly webhookEventsQueue: Queue<LivekitEventJob>,
  ) {}

  async execute(req: Request, res: Response) {
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf-8") : ""
    const authHeader = req.headers.authorization

    const event = await this.receiver.receive(rawBody, authHeader)
    if (!event) {
      logger.warn("Invalid LiveKit Webhook signature")
      return res.status(401).json({ error: "Invalid signature", status_code: 401 })
    }

    /** event.id を jobId にして重複防止。LiveKit のリトライで同 event.id が来ても 1 回のみ実行 */
    await this.webhookEventsQueue.add(
      "livekit-event",
      { type: "livekit-event", event },
      { jobId: buildLivekitEventJobId(event.id) },
    )

    return res.status(204).end()
  }
}
```

#### Router 登録（raw body）

`apps/api/src/routes/matching-router.ts` に追加:

```typescript
router.post(
  "/livekit-webhook",
  express.raw({ type: "application/webhook+json" }),
  async (req, res) => controller.execute(req, res),
)
```

`express.json()` middleware は body を JSON parse してしまい signature 検証が失敗するため、本ルートのみ raw body で受ける。

#### 認証 middleware の bypass

`apps/api/src/const/index.ts` の `PUBLIC_PATHS` に `/api/matching/livekit-webhook` を追加。

#### DI

`apps/api/src/index.ts`:

```typescript
import { LiveKitWebhookReceiverImpl } from "./client/livekit"
import { createWebhookEventsQueue } from "@repo/queue"
import { queueRedis } from "./client/redis"

const livekitWebhookReceiver = new LiveKitWebhookReceiverImpl(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
)
const webhookEventsQueue = createWebhookEventsQueue(queueRedis)
const livekitWebhookController = new LiveKitWebhookController(livekitWebhookReceiver, webhookEventsQueue)
```

### `apps/matching-worker` 側

#### Worker 登録

`apps/matching-worker/src/workers/webhook-events-worker.ts`（step0 で枠は作成済）:

```typescript
import { Worker } from "bullmq"
import { WEBHOOK_EVENTS_QUEUE_NAME, type LivekitEventJob } from "@repo/queue"
import { livekitEvent } from "../jobs/livekit-event"
import { queueRedis } from "../client/redis"

export const webhookEventsWorker = new Worker<LivekitEventJob>(
  WEBHOOK_EVENTS_QUEUE_NAME,
  async (job) => {
    if (job.data.type === "livekit-event") return livekitEvent(job.data)
  },
  {
    connection: queueRedis,
    concurrency: 20,
  },
)
```

#### `jobs/livekit-event.ts`

```typescript
import type { LivekitEventJob } from "@repo/queue"
import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
} from "@repo/queue"

const parseSessionIdFromRoom = (roomName: string | undefined): number | null => {
  if (!roomName) return null
  const m = /^matching:(\d+)$/.exec(roomName)
  return m ? Number(m[1]) : null
}

export const livekitEvent = async (data: LivekitEventJob): Promise<void> => {
  const event = data.event

  /** マッチング機能は participant_left / room_finished のみ処理 */
  if (event.event !== "participant_left" && event.event !== "room_finished") {
    logger.debug("Ignored LiveKit event", { event: event.event })
    return
  }

  const sessionId = parseSessionIdFromRoom(event.room?.name)
  if (sessionId === null) {
    logger.debug("Not a matching room, skip", { roomName: event.room?.name })
    return
  }

  const session = await matchingSessionRepository.findById(sessionId)
  if (!session) return
  if (session.status === "ENDED") {
    logger.debug("Already ended, skip", { sessionId })
    return
  }

  /** ENDED 化 */
  await matchingSessionRepository.markEnded(sessionId, "USER_LEFT")

  /** matching:ended 配信（Room はまだ存在しているはずなので publishData 可能） */
  try {
    await livekitClient.publishData({
      roomName: session.livekitRoomName,
      topic: "matching:ended",
      payload: { reason: "USER_LEFT" },
    })
  } catch (e) {
    /** room_finished 後は publishData が失敗しうるが、それで問題なし */
    logger.debug("publishData failed (room may already be closed)", { sessionId })
  }

  /** theme-progress queue の関連ジョブを削除 */
  await Promise.all([
    ...Array.from({ length: 10 }, (_, i) =>
      themeProgressQueue.removeJob(buildAdvanceThemeJobId(sessionId, i + 1))
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      themeProgressQueue.removeJob(buildPublishTimerJobId(sessionId, i))
    ),
    themeProgressQueue.removeJob(buildSessionTimeoutJobId(sessionId)),
  ])

  /** Redis スケジュール削除 */
  await redis.del(`matching:schedule:${sessionId}`)
}
```

`participant_left` と `room_finished` で同じ処理を行う（一方の発火で session が ENDED になり、もう一方は no-op になる）。

### LiveKit Cloud 側の設定

LiveKit Cloud のダッシュボードで Webhook URL を `https://<api-host>/api/matching/livekit-webhook` に設定。dev でローカル検証する際は `ngrok http 8080` でトンネリングを作って LiveKit Cloud に設定する。

## 動作確認

### Controller integration テスト（apps/api）

`apps/api/test/controller/matching/livekit-webhook.test.ts`（新規）:

- LiveKit SDK の `AccessToken` を使って正しい signature を計算した request → 204 + ジョブが queue に enqueue される（実 BullMQ で `getJob` 確認）
- 不正 signature → 401
- 同一 event.id で重複 POST → 2 回目は同 jobId で BullMQ が拒否（既に exists）→ DB に副作用なし

### Worker テスト（apps/matching-worker）

`apps/matching-worker/test/jobs/livekit-event.test.ts`（新規）:

- `participant_left` イベント → session が ENDED 化、matching:ended publish、theme-progress 関連ジョブが削除される
- `room_finished` イベント → 同上
- 既に ENDED → no-op
- マッチング以外の room（room.name が `battle:1` など）→ 無視
- マッチング機能で扱わないイベント（`track_published` 等）→ 無視

### dev で疎通

1. ngrok でローカル API を公開（`ngrok http 8080`）
2. LiveKit Cloud の Webhook URL を ngrok URL に設定
3. テスト用 matching session を作成して LiveKit Room に 2 ユーザー接続
4. 片方が disconnect → LiveKit から Webhook が ngrok 経由で届く
5. apps/api のログ「Webhook received, enqueued」
6. apps/matching-worker のログ「livekit-event processed (participant_left, sessionId=1)」
7. DB の `matching_sessions.status='ENDED' / end_reason='USER_LEFT'`

## 既知の未対応 / 後続 step に持ち越し

- LiveKit のリトライは attempts=5 で吸収。それでも失敗するイベントは BullMQ の failed jobs として残るので、CloudWatch Logs / BullMQ Dashboard で監視する運用を別途整備
- 一部の Webhook イベント（`recording_*` 等）は将来の録画機能で必要になる。本 step では無視
- Webhook URL の公開はインフラ整備（infra/terraform）に依存。Spec1 リリースまでに到達経路を準備
