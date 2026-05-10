import { prisma } from "./client/prisma"
import { queueRedis } from "./client/redis"
import { logger } from "./log"
import { themeProgressQueue, themeProgressWorker } from "./workers/theme-progress-worker"
import { webhookEventsWorker } from "./workers/webhook-events-worker"

logger.info("matching-worker started")

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "matching-worker shutting down")
  /**
   * Worker と enqueue 用 Queue は内部で queueRedis 接続を共有しているため、
   * queueRedis.quit() の前に close() してジョブ追加 / 取得を停止する。
   */
  await Promise.all([
    themeProgressWorker.close(),
    webhookEventsWorker.close(),
    themeProgressQueue.close(),
  ])
  await Promise.all([prisma.$disconnect(), queueRedis.quit()])
  logger.info("Database and Redis connections closed")
  process.exit(0)
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
