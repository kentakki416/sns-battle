import { logger } from "../log"
import type {
  BlockRepository,
  MatchingPreferenceRepository,
  MatchingQueueRepository,
  MatchingSessionRepository,
  TransactionRunner,
  UserRepository,
} from "../repository/prisma"
import type {
  MatchingEventPublisher,
  MatchingEventSubscriber,
  MatchingQueueRedisRepository,
} from "../repository/redis"
import type { Gender, MatchingPreference, MatchingSession, User } from "../types/domain"
import {
  badRequestError,
  conflictError,
  err,
  notFoundError,
  ok,
  type Result,
} from "../types/result"

/**
 * マッチング多段照合で取得する候補数の上限。
 * Spec1 の待機ピーク（5,000 人想定）に対して上位 100 件をスキャンする。
 */
const MATCHING_CANDIDATE_LIMIT = 100

/**
 * 生年月日から現在の満年齢を返す。birthDate が null なら null。
 */
const computeAge = (birthDate: Date | null): number | null => {
  if (!birthDate) return null
  const now = new Date()
  let age = now.getFullYear() - birthDate.getFullYear()
  const m = now.getMonth() - birthDate.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birthDate.getDate())) age--
  return age
}

/**
 * preference 単方向チェック: pref を持つユーザーから target を見て許容できるか。
 * pref が null なら制限なし扱いで常に true。
 */
const matchesPreferenceOneWay = (target: User, pref: MatchingPreference | null): boolean => {
  if (pref === null) return true

  /** 性別フィルタ */
  if (pref.preferredGenders.length > 0) {
    if (target.gender === null) return false
    if (!pref.preferredGenders.includes(target.gender)) return false
  }

  /** 年齢フィルタ。年齢制限ありで birthDate 不明なら除外 */
  const targetAge = computeAge(target.birthDate)
  if (pref.ageMin !== null) {
    if (targetAge === null || targetAge < pref.ageMin) return false
  }
  if (pref.ageMax !== null) {
    if (targetAge === null || targetAge > pref.ageMax) return false
  }

  /** 居住地域フィルタ */
  if (pref.preferredLocations.length > 0) {
    if (target.location === null) return false
    if (!pref.preferredLocations.includes(target.location)) return false
  }

  return true
}

/**
 * 双方向 preference 適合チェック。
 * 「自分の preference が相手を許容」かつ「相手の preference が自分を許容」で初めて true。
 */
const checkMatchingPreferences = (
  me: User,
  them: User,
  myPref: MatchingPreference | null,
  theirPref: MatchingPreference | null,
): boolean => {
  if (!matchesPreferenceOneWay(them, myPref)) return false
  if (!matchesPreferenceOneWay(me, theirPref)) return false
  return true
}

/**
 * マッチング相手のプロフィール情報。matched=true のとき UI で表示する。
 * 機密情報（email / coinBalance / createdAt 等）は含めない。
 */
export type MatchingPeerProfile = {
    id: number
    age: number | null
    avatarUrl: string | null
    bio: string | null
    gender: Gender | null
    hobbies: { id: number; name: string }[]
    location: string | null
    mbti: string | null
    name: string | null
}

/**
 * joinMatching の結果。matched=true なら即時マッチング成立、false なら待機状態。
 */
export type JoinMatchingOutput =
    | { matched: false }
    | {
          livekitRoomName: string
          matched: true
          peer: MatchingPeerProfile
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
 * 5. 上位 N 人の候補を待機時間が長い順に取得
 * 6. ブロック関係にあるユーザー id 集合を一括取得して候補から除外
 * 7. 残った候補の User / MatchingPreference を一括取得し、双方向 preference 適合チェック
 * 8. 適合した最初の候補に対して removeBothAtomic を実行
 *    - 競合で失敗したら次の候補へリトライ
 * 9. 全候補が不適合 / 競合敗北なら matched=false で待機継続
 * 10. 成立したら MatchingSession 作成 + DB queue 削除 + matched イベント publish
 */
export const joinMatching = async (
  userId: number,
  repo: {
    blockRepository: BlockRepository
    matchingEventPublisher: MatchingEventPublisher
    matchingPreferenceRepository: MatchingPreferenceRepository
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingQueueRepository: MatchingQueueRepository
    matchingSessionRepository: MatchingSessionRepository
    transactionRunner: TransactionRunner
    userRepository: UserRepository
  }
): Promise<Result<JoinMatchingOutput>> => {
  logger.debug("MatchingService: join", { userId })

  const me = await repo.userRepository.findById(userId)
  if (!me) return err(notFoundError("User not found"))
  if (!me.isOnboarded) return err(badRequestError("Onboarding not completed"))

  /**
   * 自分が既にアクティブセッションを持っているなら 409。
   * 通常は session 作成時に Redis から削除されるが、Redis クラッシュ等で
   * 過去のキューエントリが残留しているゾンビケースをここで弾く。
   */
  const myActive = await repo.matchingSessionRepository.findActiveByUserId(userId)
  if (myActive) {
    /** 念のため Redis のゾンビエントリも掃除 */
    await repo.matchingQueueRedisRepository.remove(userId)
    return err(conflictError("Already in active matching session"))
  }

  const added = await repo.matchingQueueRedisRepository.add(userId, Date.now())
  if (!added) return err(conflictError("Already in matching queue"))

  await repo.matchingQueueRepository.upsertWaiting(userId)

  /** 上位 N 候補を取得（待機時間が長い順） */
  const candidateIds = await repo.matchingQueueRedisRepository.findTopWaitingUsers(
    userId,
    MATCHING_CANDIDATE_LIMIT,
  )
  if (candidateIds.length === 0) return ok({ matched: false })

  /** ブロック関係を一括取得して候補から除外 */
  const blockedIds = await repo.blockRepository.findBlockedUserIds(userId)
  const filteredIds = candidateIds.filter((id) => !blockedIds.has(id))
  if (filteredIds.length === 0) return ok({ matched: false })

  /** 候補の User / Preference を一括取得（N+1 回避）+ 自分の Preference */
  const [candidateUsers, candidateMachingPrefs, myMachingPref] = await Promise.all([
    repo.userRepository.findManyByIds(filteredIds),
    repo.matchingPreferenceRepository.findManyByUserIds(filteredIds),
    repo.matchingPreferenceRepository.findByUserId(userId),
  ])
  const userMap = new Map(candidateUsers.map((u) => [u.id, u]))

  /** 待機時間順を保ったまま preference 適合チェックし、適合した最初の候補と排他削除を試行 */
  let chosenPeer: User | null = null
  for (const candidateId of filteredIds) {
    const candidate = userMap.get(candidateId)
    if (!candidate) continue
    const candidatePref = candidateMachingPrefs.get(candidateId) ?? null
    if (!checkMatchingPreferences(me, candidate, myMachingPref, candidatePref)) continue

    /**
     * ゾンビ検知: peer が既にアクティブセッションを持っていたら removeBothAtomic を呼ばずスキップ。
     * Redis クラッシュ後に AOF 復元すると、片方だけマッチング済みの矛盾状態が
     * 残ることがあるため、DB を真実として再確認する。
     * 先にチェックすることで、自分のキュー位置を失わずに次候補へ進める。
     */
    const peerActive = await repo.matchingSessionRepository.findActiveByUserId(candidateId)
    if (peerActive) {
      logger.warn("MatchingService: zombie queue entry detected, cleaning up", {
        peerId: candidateId,
        userId,
      })
      /** Redis のゾンビエントリを掃除しつつ次候補へ */
      await repo.matchingQueueRedisRepository.remove(candidateId)
      continue
    }

    const removed = await repo.matchingQueueRedisRepository.removeBothAtomic(userId, candidateId)
    if (!removed) continue
    chosenPeer = candidate
    break
  }

  if (!chosenPeer) return ok({ matched: false })

  /**
   * peer の最新プロフィール（hobbies 含む）を取得して UI 表示用 peer サマリを構築する。
   * findManyByIds で取得した chosenPeer は hobbies を持たないため、ここで補完する。
   * peer は直前まで matching_queue に存在し、本プロジェクトには User 削除 API が無いため
   * findProfileById は必ず非 null を返す前提（null なら想定外として throw）。
   */
  const peerProfile = await repo.userRepository.findProfileById(chosenPeer.id)
  if (!peerProfile) throw new Error(`Peer profile not found: userId=${chosenPeer.id}`)
  const peerSummary: MatchingPeerProfile = {
    id: peerProfile.user.id,
    age: computeAge(peerProfile.user.birthDate),
    avatarUrl: peerProfile.user.avatarUrl,
    bio: peerProfile.user.bio,
    gender: peerProfile.user.gender,
    hobbies: peerProfile.hobbies.map((h) => ({ id: h.id, name: h.name })),
    location: peerProfile.user.location,
    mbti: peerProfile.user.mbti,
    name: peerProfile.user.name,
  }

  /**
   * セッション作成と DB 側 matching_queue 削除を 1 トランザクションで実行。
   * Redis 側は既に removeBothAtomic で削除済み。tx 失敗時は session 不作成 + queue 残留で
   * Redis のみ消えた状態になるが、次回 join のゾンビ検知（findActiveByUserId）で吸収される。
   */
  const session: MatchingSession = await repo.transactionRunner.run(async (tx) => {
    const newSession = await repo.matchingSessionRepository.create(
      { user1Id: userId, user2Id: chosenPeer.id },
      tx,
    )
    await Promise.all([
      repo.matchingQueueRepository.deleteByUserId(userId, tx),
      repo.matchingQueueRepository.deleteByUserId(chosenPeer.id, tx),
    ])
    return newSession
  })

  /**
   * 両ユーザーの SSE 接続にマッチング成立を通知する。
   * join のレスポンスでも matched=true を返すが、別タブで /api/matching/events を購読しているケースのため
   * 冗長にも publish する。クライアントは session_id 一致で重複を判定する。
   */
  await repo.matchingEventPublisher.publishMatched([userId, chosenPeer.id], {
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
          peer: {
              id: number
              age: number | null
              avatar_url: string | null
              bio: string | null
              gender: Gender | null
              hobbies: { id: number; name: string }[]
              location: string | null
              mbti: string | null
              name: string | null
          }
          session_id: number
          type: "matched"
      }
    | { ts: number; type: "heartbeat" }
    | { reason: string; type: "cancelled" }

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000

/**
 * `/api/matching/events` 用の subscribe ハンドラ。
 *
 * - Redis Pub/Sub `matching:user:{userId}` を購読し、受信した payload を onEvent に渡す
 * - heartbeat を `heartbeatIntervalMs` 間隔で onEvent に渡す（クライアントのタイムアウト検知用）
 * - abort（クライアント切断）まで待機し、解除されたら subscribe を unsubscribe して resolve する
 *
 * テスト用に `heartbeatIntervalMs` を上書き可能にしている。
 */
export const subscribeMatchingEvents = async (
  userId: number,
  signal: AbortSignal,
  onEvent: (ev: MatchingSseEvent) => void,
  repo: { matchingEventSubscriber: MatchingEventSubscriber },
  options?: { heartbeatIntervalMs?: number },
): Promise<void> => {
  const heartbeatIntervalMs = options?.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS
  logger.debug("MatchingService: subscribe", { heartbeatIntervalMs, userId })

  const handler = (payload: string) => {
    try {
      const ev = JSON.parse(payload) as MatchingSseEvent
      onEvent(ev)
    } catch {
      /** 不正な JSON は無視（運用で起きないはずだが防御的に） */
    }
  }

  await repo.matchingEventSubscriber.subscribe(userId, handler)

  /** バックグラウンドでheatbeatを送信 */
  const interval = setInterval(() => {
    onEvent({ ts: Date.now(), type: "heartbeat" })
  }, heartbeatIntervalMs)

  try {
    /** signal.abort() が呼ばれるまで待機（既に abort 済みなら即解決） */
    await new Promise<void>((resolve) => {
      if (signal.aborted) return resolve()
      signal.addEventListener("abort", () => resolve(), { once: true })
    })
  } finally {
    clearInterval(interval)
    try {
      await repo.matchingEventSubscriber.unsubscribe(userId, handler)
    } catch (error) {
      /**
       * unsubscribe 失敗は運用上致命的でない（接続切断時に Redis 側で自動クリーンアップされる）が、
       * 頻発する場合は Redis 接続トラブルの兆候なので warn で観測可能にする。
       */
      logger.warn("MatchingService: unsubscribe failed", { error, userId })
    }
  }
}
