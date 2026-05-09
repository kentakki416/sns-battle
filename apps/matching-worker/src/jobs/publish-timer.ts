import type { PublishTimerJob } from "@repo/queue"

import { logger } from "../log"

/**
 * 30 秒ごとの残り時間配信ジョブ。Data Channel への配信は step8 で実装する。
 * step0 時点では受信ログのみ。
 */
export const publishTimer = async (data: PublishTimerJob): Promise<void> => {
  logger.info(
    { sessionId: data.sessionId, tickIndex: data.tickIndex },
    "[publish-timer] received (stub: step8 で実装)",
  )
}
