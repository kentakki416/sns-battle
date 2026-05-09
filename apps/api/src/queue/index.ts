import { createThemeProgressQueue, createWebhookEventsQueue } from "@repo/queue"

import { queueRedis } from "../client/redis"

/**
 * apps/api から enqueue 専用に使う BullMQ Queue。
 * 消化は apps/matching-worker が行う。
 */
export const themeProgressQueue = createThemeProgressQueue(queueRedis)
export const webhookEventsQueue = createWebhookEventsQueue(queueRedis)
