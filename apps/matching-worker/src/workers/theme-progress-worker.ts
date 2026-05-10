import { Worker } from "bullmq"

import {
  createThemeProgressQueue,
  THEME_PROGRESS_QUEUE_NAME,
  type ThemeProgressJob,
} from "@repo/queue"

import { LiveKitDataPublisher } from "../client/livekit"
import { prisma } from "../client/prisma"
import { queueRedis } from "../client/redis"
import { advanceTheme } from "../jobs/advance-theme"
import { publishTimer } from "../jobs/publish-timer"
import { sessionTimeout } from "../jobs/session-timeout"
import { logger } from "../log"
import {
  PrismaMatchingSessionRepository,
  PrismaTalkThemeRepository,
} from "../repository/prisma"

const LIVEKIT_HOST = process.env.LIVEKIT_HOST || "https://dummy.livekit.cloud"
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "dummy-key"
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "dummy-secret"

const matchingSessionRepository = new PrismaMatchingSessionRepository(prisma)
const talkThemeRepository = new PrismaTalkThemeRepository(prisma)
const livekitDataPublisher = new LiveKitDataPublisher(
  LIVEKIT_HOST,
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
)

/**
 * `theme-progress` queue は worker 自身が次ジョブを再 enqueue するため、
 * 同じ queue インスタンスを worker と enqueue 両方で共有する。
 */
export const themeProgressQueue = createThemeProgressQueue(queueRedis)

const deps = {
  livekitDataPublisher,
  matchingSessionRepository,
  redis: queueRedis,
  talkThemeRepository,
  themeProgressQueue,
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
