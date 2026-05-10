import { Worker } from "bullmq"

import { WEBHOOK_EVENTS_QUEUE_NAME, type WebhookEventsJob } from "@repo/queue"

import { LiveKitDataPublisher } from "../client/livekit"
import { prisma } from "../client/prisma"
import { queueRedis } from "../client/redis"
import { livekitEvent } from "../jobs/livekit-event"
import { logger } from "../log"
import { PrismaMatchingSessionRepository } from "../repository/prisma"

import { themeProgressQueue } from "./theme-progress-worker"

const LIVEKIT_HOST = process.env.LIVEKIT_HOST || "https://dummy.livekit.cloud"
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "dummy-key"
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "dummy-secret"

const matchingSessionRepository = new PrismaMatchingSessionRepository(prisma)
const livekitDataPublisher = new LiveKitDataPublisher(
  LIVEKIT_HOST,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
)

/**
 * webhook-events queue は theme-progress queue 上の delayed ジョブを掃除する必要があるため、
 * theme-progress-worker が export している共有 Queue インスタンスを deps に注入する。
 */
const deps = {
  livekitDataPublisher,
  matchingSessionRepository,
  redis: queueRedis,
  themeProgressQueue,
}

export const webhookEventsWorker = new Worker<WebhookEventsJob>(
  WEBHOOK_EVENTS_QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
    case "livekit-event":
      return livekitEvent(job.data, deps)
    }
  },
  {
    concurrency: 20,
    connection: queueRedis,
  },
)

webhookEventsWorker.on("failed", (job, err) => {
  logger.error(
    { err, jobId: job?.id, name: WEBHOOK_EVENTS_QUEUE_NAME },
    "[webhook-events] job failed",
  )
})

webhookEventsWorker.on("completed", (job) => {
  logger.debug(
    { jobId: job.id, name: WEBHOOK_EVENTS_QUEUE_NAME },
    "[webhook-events] job completed",
  )
})
