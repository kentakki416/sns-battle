import type { AdvanceThemeJob } from "@repo/queue"

import { logger } from "../log"

/**
 * テーマ進行ジョブ。次ラウンドへ進める処理は step8 で実装する。
 * step0 時点では受信ログのみ。
 */
export const advanceTheme = async (data: AdvanceThemeJob): Promise<void> => {
  logger.info(
    { nextRoundNumber: data.nextRoundNumber, sessionId: data.sessionId },
    "[advance-theme] received (stub: step8 で実装)",
  )
}
