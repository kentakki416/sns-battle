import { EventEmitter } from "node:events"

import { logger } from "../log"
import type {
  BlockRepository,
  MatchingQueueRepository,
  MatchingSessionRepository,
  UserRepository,
} from "../repository/prisma"
import type {
  MatchingEventPublisher,
  MatchingEventSubscriber,
  MatchingQueueRedisRepository,
} from "../repository/redis"
import type { MatchingSession } from "../types/domain"
import {
  badRequestError,
  conflictError,
  err,
  notFoundError,
  ok,
  type Result,
} from "../types/result"

/**
 * joinMatching の結果。matched=true なら即時マッチング成立、false なら待機状態。
 */
export type JoinMatchingOutput =
    | { matched: false }
    | {
          livekitRoomName: string
          matched: true
          peer: { avatarUrl: string | null; id: number; name: string | null }
          sessionId: number
      }

/**
 * getMatchingStatus の結果。
 */
export type GetMatchingStatusOutput = {
    /** WAITING のときのみ 0 始まり、それ以外は null */
    position: number | null
    status: "WAITING" | "MATCHED" | "NONE"
    /** WAITING のときのみ秒数、それ以外は null */
    waitedSeconds: number | null
}

/**
 * マッチングキュー参加処理。
 *
 * 1. ユーザーが is_onboarded=true か確認（false なら 400）
 * 2. Redis に既に WAITING ならば 409
 * 3. Redis にユーザーを ZADD（score=現在 ms）
 * 4. DB の matching_queue に WAITING で upsert（監査用）
 * 5. 自分以外の最古ユーザー（peer 候補）を探す
 *    - いなければ matched=false で返却（自分は WAITING のまま）
 * 6. peer がブロック関係 → 自分は WAITING のまま、matched=false
 *    （ブロック相手をスキップする多段照合は step3 以降で対応）
 * 7. removeBothAtomic で 2 ユーザーを排他削除
 *    - 失敗（競合 / 既にいない）→ 自分は WAITING のまま、matched=false
 * 8. MatchingSession を作成し、peer プロフィールと共に matched=true で返却
 */
export const joinMatching = async (
  userId: number,
  repo: {
    blockRepository: BlockRepository
    matchingEventPublisher: MatchingEventPublisher
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingQueueRepository: MatchingQueueRepository
    matchingSessionRepository: MatchingSessionRepository
    userRepository: UserRepository
  }
): Promise<Result<JoinMatchingOutput>> => {
  logger.debug("MatchingService: join", { userId })

  const me = await repo.userRepository.findById(userId)
  if (!me) return err(notFoundError("User not found"))
  if (!me.isOnboarded) return err(badRequestError("Onboarding not completed"))

  const added = await repo.matchingQueueRedisRepository.add(userId, Date.now())
  if (!added) return err(conflictError("Already in matching queue"))

  await repo.matchingQueueRepository.upsertWaiting(userId)

  const peerId = await repo.matchingQueueRedisRepository.findOldestPeer(userId)
  if (peerId === null) {
    return ok({ matched: false })
  }

  const blocked = await repo.blockRepository.existsBetween(userId, peerId)
  if (blocked) {
    /**
     * 簡略実装: ブロック相手しかいない場合は自分は WAITING のまま、マッチング不成立とする。
     * 多段照合（次の peer を試す）は step3 以降で対応。
     */
    return ok({ matched: false })
  }

  const removed = await repo.matchingQueueRedisRepository.removeBothAtomic(userId, peerId)
  if (!removed) {
    /**
     * 競合（他リクエストが先に peer をマッチング済 / 自分が leave 済）。
     * 自分はキューに残っている可能性があるため、Redis 状態に従い不成立で返す。
     */
    return ok({ matched: false })
  }

  const peer = await repo.userRepository.findById(peerId)
  if (!peer) {
    /**
     * peer のレコードが直前に消えた等の極端なケース。Redis から既に削除済なので
     * 自分も leave 状態にして 404 を返す。
     */
    await repo.matchingQueueRedisRepository.remove(userId)
    return err(notFoundError("Peer user not found"))
  }

  const session: MatchingSession = await repo.matchingSessionRepository.create({
    user1Id: userId,
    user2Id: peerId,
  })
  await Promise.all([
    repo.matchingQueueRepository.deleteByUserId(userId),
    repo.matchingQueueRepository.deleteByUserId(peerId),
  ])

  const peerSummary = { avatarUrl: peer.avatarUrl, id: peer.id, name: peer.name }
  /**
   * 両ユーザーの SSE 接続にマッチング成立を通知する。
   * join のレスポンスでも matched=true を返すが、別タブで /api/matching/events を購読しているケースのため
   * 冗長にも publish する。クライアントは session_id 一致で重複を判定する。
   */
  await repo.matchingEventPublisher.publishMatched([userId, peerId], {
    livekitRoomName: session.livekitRoomName,
    peer: peerSummary,
    sessionId: session.id,
  })

  return ok({
    livekitRoomName: session.livekitRoomName,
    matched: true,
    peer: peerSummary,
    sessionId: session.id,
  })
}

/**
 * マッチングキュー離脱処理。
 * Redis と DB の両方から自分のエントリを削除する。元々参加していなくても 200 を返す（冪等）。
 */
export const leaveMatching = async (
  userId: number,
  repo: {
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingQueueRepository: MatchingQueueRepository
  }
): Promise<Result<void>> => {
  logger.debug("MatchingService: leave", { userId })
  await Promise.all([
    repo.matchingQueueRedisRepository.remove(userId),
    repo.matchingQueueRepository.deleteByUserId(userId),
  ])
  return ok(undefined)
}

/**
 * 自分の現在の待機状態を取得する。
 *
 * 優先順位:
 * 1. アクティブな MatchingSession（COUNTDOWN / ACTIVE）があれば MATCHED
 * 2. Redis Sorted Set に存在すれば WAITING（position と waited_seconds を返す）
 * 3. それ以外は NONE
 */
export const getMatchingStatus = async (
  userId: number,
  repo: {
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingSessionRepository: MatchingSessionRepository
  }
): Promise<Result<GetMatchingStatusOutput>> => {
  logger.debug("MatchingService: status", { userId })

  const active = await repo.matchingSessionRepository.findActiveByUserId(userId)
  if (active) {
    return ok({ position: null, status: "MATCHED", waitedSeconds: null })
  }

  const [position, joinedAt] = await Promise.all([
    repo.matchingQueueRedisRepository.findPosition(userId),
    repo.matchingQueueRedisRepository.findJoinedAt(userId),
  ])
  if (position === null || joinedAt === null) {
    return ok({ position: null, status: "NONE", waitedSeconds: null })
  }

  const waitedSeconds = Math.max(0, Math.floor((Date.now() - joinedAt) / 1000))
  return ok({ position, status: "WAITING", waitedSeconds })
}

/**
 * SSE で配信する単一イベント。`packages/schema` の `MatchingEvent` と同じ wire 形式（snake_case）。
 * Controller は本値をそのまま JSON.stringify して `data:` 行に書き出す。
 */
export type MatchingSseEvent =
    | {
          livekit_room_name: string
          peer: { avatar_url: string | null; id: number; name: string | null }
          session_id: number
          type: "matched"
      }
    | { ts: number; type: "heartbeat" }
    | { reason: string; type: "cancelled" }

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * `/api/matching/events` 用の AsyncGenerator。
 *
 * - Redis Pub/Sub `matching:user:{userId}` を購読し、受信した payload を yield
 * - heartbeat を `heartbeatIntervalMs` 間隔で yield（クライアントのタイムアウト検知用）
 * - abort（クライアント切断）で generator を完了し、subscribe 解除
 *
 * テスト用に `heartbeatIntervalMs` を上書き可能にしている。
 */
export const subscribeMatchingEvents = async function* (
  userId: number,
  signal: AbortSignal,
  repo: { matchingEventSubscriber: MatchingEventSubscriber },
  options?: { heartbeatIntervalMs?: number },
): AsyncGenerator<MatchingSseEvent> {
  const heartbeatIntervalMs = options?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  logger.debug("MatchingService: subscribe", { heartbeatIntervalMs, userId })

  const queue: MatchingSseEvent[] = []
  const wakeup = new EventEmitter()
  const drainSignal = "data"

  const handler = (payload: string) => {
    try {
      const ev = JSON.parse(payload) as MatchingSseEvent
      queue.push(ev)
    } catch {
      /** 不正な JSON は無視（運用で起きないはずだが防御的に） */
    }
    wakeup.emit(drainSignal)
  }

  await repo.matchingEventSubscriber.subscribe(userId, handler)

  const interval = setInterval(() => {
    queue.push({ ts: Date.now(), type: "heartbeat" })
    wakeup.emit(drainSignal)
  }, heartbeatIntervalMs)

  const onAbort = () => wakeup.emit(drainSignal)
  signal.addEventListener("abort", onAbort)

  try {
    while (!signal.aborted) {
      while (queue.length > 0) {
        yield queue.shift()!
      }
      if (signal.aborted) break
      await new Promise<void>((resolve) => wakeup.once(drainSignal, resolve))
    }
  } finally {
    clearInterval(interval)
    signal.removeEventListener("abort", onAbort)
    try {
      await repo.matchingEventSubscriber.unsubscribe(userId, handler)
    } catch {
      /** unsubscribe 失敗は運用上致命的でないので無視（generator は既に完了するパス） */
    }
  }
}
