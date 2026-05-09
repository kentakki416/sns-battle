import { logger } from "./log"
import { themeProgressWorker } from "./workers/theme-progress-worker"
import { webhookEventsWorker } from "./workers/webhook-events-worker"

logger.info("matching-worker started")

const shutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, "matching-worker shutting down")
  await Promise.all([
    themeProgressWorker.close(),
    webhookEventsWorker.close(),
  ])
  process.exit(0)
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM")
})
process.on("SIGINT", () => {
  void shutdown("SIGINT")
})
