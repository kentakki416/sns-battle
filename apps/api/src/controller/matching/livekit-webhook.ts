import type { Queue } from "bullmq"
import type { Request, Response } from "express"

import {
  buildLivekitEventJobId,
  WEBHOOK_EVENTS_QUEUE_NAME,
  type WebhookEventsJob,
} from "@repo/queue"

import { ILiveKitWebhookReceiver } from "../../client/livekit"
import { logger } from "../../log"

/**
 * POST /api/matching/livekit-webhook
 *
 * LiveKit Cloud から発火される Webhook の受信口。本コントローラーは
 *  1) signature 検証
 *  2) BullMQ `webhook-events` キューに `livekit-event` ジョブを enqueue（jobId=`livekit:${event.id}` で重複防止）
 *  3) 即 204 を返却
 * のみを行い、DB 反映 / Data Channel 配信は matching-worker 側に委譲する。
 *
 * LiveKit はリトライするため、副作用は worker 側で idempotent に実装する。
 */
export class LiveKitWebhookController {
  constructor(
        private readonly receiver: ILiveKitWebhookReceiver,
        private readonly webhookEventsQueue: Queue<WebhookEventsJob>,
  ) {}

  async execute(req: Request, res: Response) {
    /**
     * express.raw() で Buffer を受け取る前提。`express.json()` では署名検証が失敗するため
     * 本ルート専用に raw body middleware を適用している（router 側で配線）。
     */
    const rawBody = req.body instanceof Buffer ? req.body.toString("utf-8") : ""
    const authHeader = req.headers.authorization

    const event = await this.receiver.receive(rawBody, authHeader)
    if (!event) {
      logger.warn("LiveKitWebhookController: invalid signature")
      return res.status(401).json({ error: "Invalid signature", status_code: 401 })
    }

    /**
     * jobId に LiveKit の event.id を流用。同一 event.id の重複到達は BullMQ が
     * 二重 enqueue を拒否するため、worker 側で重複処理を心配する必要がない。
     * id が空文字（極稀）の場合はフォールバックとして event.createdAt を使う。
     */
    const eventId = event.id && event.id.length > 0
      ? event.id
      : `fallback:${event.createdAt ?? Date.now()}`

    /**
     * BullMQ シリアライズ境界では WebhookEvent クラスのメソッドは失われるので、
     * worker は event を Record<string, unknown> として扱う前提。toJson 同等の形で渡す。
     */
    await this.webhookEventsQueue.add(
      "livekit-event",
      {
        event: event.toJson() as Record<string, unknown>,
        eventId,
        type: "livekit-event",
      },
      { jobId: buildLivekitEventJobId(eventId) },
    )

    logger.info("LiveKitWebhookController: enqueued", {
      eventId,
      eventName: event.event,
      queue: WEBHOOK_EVENTS_QUEUE_NAME,
      roomName: event.room?.name,
    })
    return res.status(204).end()
  }
}
