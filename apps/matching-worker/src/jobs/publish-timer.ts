import type { Queue } from "bullmq"

import {
  buildPublishTimerJobId,
  type PublishTimerJob,
  type ThemeProgressJob,
} from "@repo/queue"

import type { ILiveKitDataPublisher } from "../client/livekit"
import { logger } from "../log"
import type { MatchingSessionRepository } from "../repository/prisma"

const TICK_INTERVAL_MS = 30_000
const TOTAL_DURATION_SECONDS = 600
/** 5 分（spec1 の手動終了可能ボーダー） */
const CAN_END_NOW_THRESHOLD_SECONDS = 300

type PublishTimerDeps = {
    livekitDataPublisher: ILiveKitDataPublisher
    matchingSessionRepository: MatchingSessionRepository
    themeProgressQueue: Queue<ThemeProgressJob>
}

/**
 * `publish-timer` ジョブの消化処理。
 *
 * 1. session ENDED または `startedAt=null`（COUNTDOWN 中の早撃ちジョブ）→ no-op
 * 2. 残り時間 = 600 - 経過秒。0 以下なら no-op（session-timeout 側で終了処理）
 * 3. matching:timer を Data Channel に publish
 *    - `remaining_seconds`: 残り秒
 *    - `can_end_now`: 経過 >= 300 秒（手動終了 UI を活性化）
 * 4. 30 秒後に次 tick を再 enqueue（jobId 決定的）
 */
export const publishTimer = async (
  data: PublishTimerJob,
  deps: PublishTimerDeps,
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED" || !session.startedAt) {
    logger.debug(
      { sessionId: data.sessionId, tick: data.tickIndex },
      "[publish-timer] no-op (session not active)",
    )
    return
  }

  const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
  const remaining = Math.max(0, TOTAL_DURATION_SECONDS - elapsed)
  if (remaining === 0) {
    logger.debug(
      { sessionId: data.sessionId, tick: data.tickIndex },
      "[publish-timer] no-op (remaining=0)",
    )
    return
  }

  await deps.livekitDataPublisher.publishData({
    payload: {
      can_end_now: elapsed >= CAN_END_NOW_THRESHOLD_SECONDS,
      remaining_seconds: remaining,
    },
    roomName: session.livekitRoomName,
    topic: "matching:timer",
  })

  const nextTick = data.tickIndex + 1
  await deps.themeProgressQueue.add(
    "publish-timer",
    { sessionId: data.sessionId, tickIndex: nextTick, type: "publish-timer" },
    {
      delay: TICK_INTERVAL_MS,
      jobId: buildPublishTimerJobId(data.sessionId, nextTick),
    },
  )

  logger.info(
    { remaining, sessionId: data.sessionId, tick: data.tickIndex },
    "[publish-timer] processed",
  )
}
