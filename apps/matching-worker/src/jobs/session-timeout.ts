import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  type SessionTimeoutJob,
  type ThemeProgressJob,
} from "@repo/queue"

import type { ILiveKitDataPublisher } from "../client/livekit"
import { logger } from "../log"
import type { MatchingSessionRepository } from "../repository/prisma"

/** advance-theme ジョブの round 数（schedule 同様 10）と publish-timer の最大 tick 数 */
const ADVANCE_THEME_ROUNDS = 10
const PUBLISH_TIMER_MAX_TICKS = 20

type SessionTimeoutDeps = {
    livekitDataPublisher: ILiveKitDataPublisher
    matchingSessionRepository: MatchingSessionRepository
    redis: Redis
    themeProgressQueue: Queue<ThemeProgressJob>
}

/**
 * `session-timeout` ジョブの消化処理（10 分後に走る）。
 *
 * 1. session が既に ENDED → no-op（手動終了 / Webhook 由来の USER_LEFT 等）
 * 2. session を `status='ENDED'` / `endReason='TIMEOUT'` に更新
 * 3. matching:ended を Data Channel に publish
 * 4. 残ジョブを掃除:
 *    - advance-theme(round=1..10) を `removeJob` で削除
 *    - publish-timer(tick=0..19) を `removeJob` で削除
 *    （active ジョブは消せないが、消化時に session が ENDED で no-op するので問題ない）
 * 5. Redis の matching:schedule:{sessionId} を削除
 */
export const sessionTimeout = async (
  data: SessionTimeoutJob,
  deps: SessionTimeoutDeps,
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") {
    logger.debug(
      { sessionId: data.sessionId },
      "[session-timeout] no-op (session not found or already ended)",
    )
    return
  }

  await deps.matchingSessionRepository.markEnded(data.sessionId, "TIMEOUT")

  await deps.livekitDataPublisher.publishData({
    payload: { reason: "TIMEOUT" },
    roomName: session.livekitRoomName,
    topic: "matching:ended",
  })

  /**
   * 残ジョブの掃除。BullMQ では Queue から直接削除するメソッドが無いため、
   * `getJob(jobId)` で取得して `job.remove()` を呼ぶ。存在しない jobId は undefined が返るので
   * optional chaining でスキップ。active 中のジョブは `remove()` が例外を投げる可能性があるため
   * try/catch で無視する（消化時に session ENDED で no-op するため副作用は出ない）。
   */
  const removeJob = async (jobId: string): Promise<void> => {
    const job = await deps.themeProgressQueue.getJob(jobId)
    if (!job) return
    try {
      await job.remove()
    } catch (err) {
      logger.debug({ err, jobId }, "[session-timeout] removeJob skipped (likely active)")
    }
  }
  const advanceJobs = Array.from({ length: ADVANCE_THEME_ROUNDS }, async (_, i) =>
    removeJob(buildAdvanceThemeJobId(data.sessionId, i + 1)),
  )
  const timerJobs = Array.from({ length: PUBLISH_TIMER_MAX_TICKS }, async (_, i) =>
    removeJob(buildPublishTimerJobId(data.sessionId, i)),
  )
  await Promise.all([...advanceJobs, ...timerJobs])

  await deps.redis.del(`matching:schedule:${data.sessionId}`)

  logger.info({ sessionId: data.sessionId }, "[session-timeout] processed")
}
