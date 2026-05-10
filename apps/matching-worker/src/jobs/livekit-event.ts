import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
  type LivekitEventJob,
  type ThemeProgressJob,
} from "@repo/queue"

import type { ILiveKitDataPublisher } from "../client/livekit"
import { logger } from "../log"
import type { MatchingSessionRepository } from "../repository/prisma"

/** advance-theme ジョブの round 数（schedule 同様 10）と publish-timer の最大 tick 数 */
const ADVANCE_THEME_ROUNDS = 10
const PUBLISH_TIMER_MAX_TICKS = 20

type LivekitEventDeps = {
    livekitDataPublisher: ILiveKitDataPublisher
    matchingSessionRepository: MatchingSessionRepository
    redis: Redis
    themeProgressQueue: Queue<ThemeProgressJob>
}

/**
 * LiveKit Webhook の room.name から `matching:${sessionId}` 形式を抽出する。
 * battle 機能や録画用 room などマッチング以外の room を区別するため、形式不一致は null を返す。
 */
const extractSessionIdFromRoomName = (roomName: string | undefined): number | null => {
  if (!roomName) return null
  const match = /^matching:(\d+)$/.exec(roomName)
  return match ? Number(match[1]) : null
}

/**
 * LiveKit Webhook event を消化するジョブ。
 *
 * 1. event.event が `participant_left` / `room_finished` 以外なら早期 return（無視）
 * 2. room.name が `matching:{id}` 形式でなければ無視（battle など他機能の room）
 * 3. session が見つからない / 既に ENDED なら no-op（リトライ / 重複到達対策）
 * 4. session を `status='ENDED'` / `endReason='USER_LEFT'` に更新
 * 5. matching:ended を Data Channel に publish（room_finished 後は失敗しうるので warn のみ）
 * 6. theme-progress queue の関連ジョブ（advance×10 + timer×20 + session-timeout）を掃除
 * 7. Redis の matching:schedule:{sessionId} を削除
 *
 * `participant_left` と `room_finished` の双方が届いても 2 回目は (3) で no-op になるため idempotent。
 */
export const livekitEvent = async (
  data: LivekitEventJob,
  deps: LivekitEventDeps,
): Promise<void> => {
  const event = data.event
  const eventName = typeof event.event === "string" ? event.event : undefined

  if (eventName !== "participant_left" && eventName !== "room_finished") {
    logger.debug({ eventId: data.eventId, eventName }, "[livekit-event] ignored (not target event)")
    return
  }

  const room = event.room as { name?: string } | undefined
  const sessionId = extractSessionIdFromRoomName(room?.name)
  if (sessionId === null) {
    logger.debug(
      { eventId: data.eventId, eventName, roomName: room?.name },
      "[livekit-event] ignored (not a matching room)",
    )
    return
  }

  const session = await deps.matchingSessionRepository.findById(sessionId)
  if (!session) {
    logger.debug({ eventId: data.eventId, sessionId }, "[livekit-event] no-op (session not found)")
    return
  }
  if (session.status === "ENDED") {
    logger.debug({ eventId: data.eventId, sessionId }, "[livekit-event] no-op (already ended)")
    return
  }

  await deps.matchingSessionRepository.markEnded(sessionId, "USER_LEFT")

  /**
   * Room はまだ存在しているはずなので publishData 可能だが、room_finished 後や
   * クライアントが既に全員 disconnect している場合は失敗しうる。失敗しても
   * セッション終了処理は完了済みなので warn ログのみで継続する。
   */
  try {
    await deps.livekitDataPublisher.publishData({
      payload: { reason: "USER_LEFT" },
      roomName: session.livekitRoomName,
      topic: "matching:ended",
    })
  } catch (err) {
    logger.warn(
      { err, eventId: data.eventId, sessionId },
      "[livekit-event] publishData failed (room may already be closed)",
    )
  }

  /**
   * 残ジョブの掃除。`session-timeout.ts` と同パターンで `getJob → job.remove()` を使う。
   * 存在しない jobId は undefined。active 中のジョブは `remove()` が例外を投げる可能性があるが、
   * 消化時に session が ENDED で no-op するため副作用は出ない。
   */
  const removeJob = async (jobId: string): Promise<void> => {
    const job = await deps.themeProgressQueue.getJob(jobId)
    if (!job) return
    try {
      await job.remove()
    } catch (err) {
      logger.debug({ err, jobId }, "[livekit-event] removeJob skipped (likely active)")
    }
  }
  const advanceJobs = Array.from({ length: ADVANCE_THEME_ROUNDS }, async (_, i) =>
    removeJob(buildAdvanceThemeJobId(sessionId, i + 1)),
  )
  const timerJobs = Array.from({ length: PUBLISH_TIMER_MAX_TICKS }, async (_, i) =>
    removeJob(buildPublishTimerJobId(sessionId, i)),
  )
  await Promise.all([
    ...advanceJobs,
    ...timerJobs,
    removeJob(buildSessionTimeoutJobId(sessionId)),
  ])

  await deps.redis.del(`matching:schedule:${sessionId}`)

  logger.info(
    { eventId: data.eventId, eventName, sessionId },
    "[livekit-event] processed",
  )
}
