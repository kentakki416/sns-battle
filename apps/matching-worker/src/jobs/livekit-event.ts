import type { LivekitEventJob } from "@repo/queue"

import { logger } from "../log"

/**
 * LiveKit Webhook イベント処理ジョブ。participant_left / room_finished の DB 反映や
 * Data Channel 配信は step9 で実装する。step0 時点では受信ログのみ。
 */
export const livekitEvent = async (data: LivekitEventJob): Promise<void> => {
  logger.info(
    { eventId: data.eventId },
    "[livekit-event] received (stub: step9 で実装)",
  )
}
