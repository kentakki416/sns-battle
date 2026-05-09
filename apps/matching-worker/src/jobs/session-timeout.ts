import type { SessionTimeoutJob } from "@repo/queue"

import { logger } from "../log"

/**
 * セッション 10 分タイムアウトジョブ。session 終了処理は step8 で実装する。
 * step0 時点では受信ログのみ。
 */
export const sessionTimeout = async (data: SessionTimeoutJob): Promise<void> => {
  logger.info(
    { sessionId: data.sessionId },
    "[session-timeout] received (stub: step8 で実装)",
  )
}
