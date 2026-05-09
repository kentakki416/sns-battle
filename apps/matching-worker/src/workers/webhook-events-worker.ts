import { Worker } from "bullmq"

import { WEBHOOK_EVENTS_QUEUE_NAME, type WebhookEventsJob } from "@repo/queue"

import { queueRedis } from "../client/redis"
import { livekitEvent } from "../jobs/livekit-event"
import { logger } from "../log"

export const webhookEventsWorker = new Worker<WebhookEventsJob>(
  WEBHOOK_EVENTS_QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
    case "livekit-event":
      return livekitEvent(job.data)
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
