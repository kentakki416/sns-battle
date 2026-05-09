import { Queue } from "bullmq"
import type { Redis } from "ioredis"

export const WEBHOOK_EVENTS_QUEUE_NAME = "webhook-events"

/**
 * LiveKit Webhook event を BullMQ ジョブとして enqueue するための payload。
 * apps/api 側で signature 検証を済ませた上で、Webhook の生 payload を
 * `event` として埋め込み、matching-worker が後段の副作用（room finished /
 * participant left の DB 反映、Data Channel 配信）を非同期に処理する。
 */
export type LivekitEventJob = {
  type: "livekit-event"
  /** LiveKit Webhook が付与する event の id（idempotency キーに使用） */
  eventId: string
  /** Webhook の event payload。LiveKit SDK の WebhookEvent をそのまま JSON 化したもの */
  event: Record<string, unknown>
}

export type WebhookEventsJob = LivekitEventJob

export const createWebhookEventsQueue = (redis: Redis): Queue<WebhookEventsJob> => {
  return new Queue<WebhookEventsJob>(WEBHOOK_EVENTS_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 5,
      backoff: { delay: 2000, type: "exponential" },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  })
}

/** Webhook event の id を流用して重複 enqueue を防ぐ */
export const buildLivekitEventJobId = (eventId: string): string => { return `livekit:${eventId}`}