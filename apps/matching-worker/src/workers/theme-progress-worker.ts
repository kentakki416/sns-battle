import { Worker } from "bullmq"

import { THEME_PROGRESS_QUEUE_NAME, type ThemeProgressJob } from "@repo/queue"

import { queueRedis } from "../client/redis"
import { advanceTheme } from "../jobs/advance-theme"
import { publishTimer } from "../jobs/publish-timer"
import { sessionTimeout } from "../jobs/session-timeout"
import { logger } from "../log"

export const themeProgressWorker = new Worker<ThemeProgressJob>(
  THEME_PROGRESS_QUEUE_NAME,
  async (job) => {
    switch (job.data.type) {
    case "advance-theme":
      return advanceTheme(job.data)
    case "publish-timer":
      return publishTimer(job.data)
    case "session-timeout":
      return sessionTimeout(job.data)
    }
  },
  {
    concurrency: 50,
    connection: queueRedis,
  },
)

themeProgressWorker.on("failed", (job, err) => {
  logger.error(
    { err, jobId: job?.id, name: THEME_PROGRESS_QUEUE_NAME },
    "[theme-progress] job failed",
  )
})

themeProgressWorker.on("completed", (job) => {
  logger.debug(
    { jobId: job.id, name: THEME_PROGRESS_QUEUE_NAME },
    "[theme-progress] job completed",
  )
})
