import type { ILiveKitClient } from "../client/livekit"
import { calculateMbtiCompatibility } from "../lib/mbti"
import { logger } from "../log"
import type {
  BlockRepository,
  ItemRepository,
  MatchingPreferenceRepository,
  MatchingQueueRepository,
  MatchingReactionRepository,
  MatchingSessionRepository,
  TalkThemeRepository,
  TransactionRunner,
  UserInventoryRepository,
  UserRepository,
} from "../repository/prisma"
import type { ThemeProgressEnqueuer } from "../repository/queue"
import type {
  MatchingEventPublisher,
  MatchingEventSubscriber,
  MatchingQueueRedisRepository,
  RateLimitRedisRepository,
} from "../repository/redis"
import type {
  Gender,
  MatchingEndReason,
  MatchingPreference,
  MatchingSession,
  StampAnimationType,
  StampForMatching,
  TalkThemeChoice,
  User,
} from "../types/domain"
import {
  badRequestError,
  conflictError,
  err,
  forbiddenError,
  goneError,
  notFoundError,
  ok,
  type Result,
  tooManyRequestsError,
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
    /**
     * tx 内のクエリは Prisma 側で同一接続上に直列化されるため、Promise.all で並列に
     * 見せても実行は逐次。意図を明確にするため await を 2 つ並べる。
     */
    await repo.matchingQueueRepository.deleteByUserId(userId, tx)
    await repo.matchingQueueRepository.deleteByUserId(chosenPeer.id, tx)
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

/**
 * `POST /api/matching/token` の戻り値。LiveKit クライアントが Room に接続するために必要な
 * JWT と接続先 URL のセットを返す。expiresAt は unix epoch 秒。
 */
export type IssueMatchingTokenOutput = {
    expiresAt: number
    livekitUrl: string
    roomName: string
    token: string
}

/**
 * LiveKit Room トークンの有効期限（秒）。仕様 step4 より 1 時間。
 */
const MATCHING_TOKEN_TTL_SECONDS = 3600

/**
 * 指定セッションへの LiveKit Room 接続トークンを発行する。
 *
 * - セッションが存在しない → 404
 * - セッションが ENDED → 410（ルームは既に閉じている）
 * - 自分が user1 / user2 のどちらでもない → 403
 * - identity は `user:{userId}` 形式で発行（同一ルーム内で衝突しないように）
 * - canPublish / canPublishData / canSubscribe を全て付与（VideoGrant 既定値）
 */
export const issueMatchingToken = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
  client: { livekitClient: ILiveKitClient; livekitUrl: string },
): Promise<Result<IssueMatchingTokenOutput>> => {
  logger.debug("MatchingService: issueToken", { sessionId: input.sessionId, userId: input.userId })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.status === "ENDED") return err(goneError("Session already ended"))
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant of this session"))
  }

  const token = await client.livekitClient.generateRoomToken({
    identity: `user:${input.userId}`,
    roomName: session.livekitRoomName,
    ttlSeconds: MATCHING_TOKEN_TTL_SECONDS,
  })

  return ok({
    expiresAt: Math.floor(Date.now() / 1000) + MATCHING_TOKEN_TTL_SECONDS,
    livekitUrl: client.livekitUrl,
    roomName: session.livekitRoomName,
    token,
  })
}

/**
 * セッション参加者の最小公開プロフィール。
 * id / name / avatar に加えて MBTI（Phase 6 相性スコア用）を返す。
 */
export type MatchingSessionParticipant = {
    id: number
    avatarUrl: string | null
    mbti: string | null
    name: string | null
}

/**
 * `GET /api/matching/sessions/:id` の戻り値。
 *
 * - `elapsedSeconds`: started_at からの経過秒（COUNTDOWN なら 0）
 * - `canEndNow`: ACTIVE かつ 5 分経過済のときのみ true
 * - `isSelfUser1`: リクエスト主体が user1 か（VS レイアウトの左右割り当てに使う）
 * - `mbtiCompatibility`: 0..100 の相性スコア。いずれかの MBTI が未設定なら null
 */
export type MatchingSessionView = {
    canEndNow: boolean
    elapsedSeconds: number
    isSelfUser1: boolean
    mbtiCompatibility: number | null
    session: MatchingSession
    user1: MatchingSessionParticipant
    user2: MatchingSessionParticipant
}

/**
 * 手動終了の最低経過秒。spec1 の「5 分経過後に終了できます」制約。
 * step8 の TIMEOUT 自動終了 / step9 の USER_LEFT には適用しない。
 */
const MATCHING_SESSION_MIN_END_SECONDS = 300

/**
 * 経過秒の安全な算出。startedAt が null（COUNTDOWN）の場合は 0 を返す。
 */
const computeElapsedSeconds = (startedAt: Date | null): number => {
  if (!startedAt) return 0
  return Math.max(0, Math.floor((Date.now() - startedAt.getTime()) / 1000))
}

/**
 * セッション参加者かどうか判定するヘルパ。
 */
const isParticipant = (session: MatchingSession, userId: number): boolean =>
  session.user1Id === userId || session.user2Id === userId

/**
 * 指定セッションの詳細を取得する。
 *
 * - 未存在 → 404
 * - 自分が user1 / user2 のどちらでもない → 403
 * - 参加者の User row は必ず存在する前提（User 削除 API は本プロジェクトに無い）。
 *   万一 null なら整合性破壊なので 404 を返す（throw ではなく業務エラー扱い）
 */
export const getMatchingSession = async (
  input: { sessionId: number; userId: number },
  repo: {
    matchingSessionRepository: MatchingSessionRepository
    userRepository: UserRepository
  },
): Promise<Result<MatchingSessionView>> => {
  logger.debug("MatchingService: getSession", {
    sessionId: input.sessionId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }

  const [user1, user2] = await Promise.all([
    repo.userRepository.findById(session.user1Id),
    repo.userRepository.findById(session.user2Id),
  ])
  if (!user1 || !user2) return err(notFoundError("Participant user not found"))

  const elapsedSeconds = computeElapsedSeconds(session.startedAt)
  const canEndNow =
        session.status === "ACTIVE" && elapsedSeconds >= MATCHING_SESSION_MIN_END_SECONDS

  return ok({
    canEndNow,
    elapsedSeconds,
    isSelfUser1: session.user1Id === input.userId,
    mbtiCompatibility: calculateMbtiCompatibility(user1.mbti, user2.mbti),
    session,
    user1: { id: user1.id, avatarUrl: user1.avatarUrl, mbti: user1.mbti, name: user1.name },
    user2: { id: user2.id, avatarUrl: user2.avatarUrl, mbti: user2.mbti, name: user2.name },
  })
}

/**
 * `POST /api/matching/sessions/:id/start` の戻り値。
 *
 * - `startedAt`: ACTIVE に遷移した時刻。冪等呼び出しの場合は既存値が入る
 */
export type StartMatchingSessionOutput = {
    sessionId: number
    startedAt: Date
}

/**
 * セッションを COUNTDOWN → ACTIVE に遷移させ、テーマ進行ジョブ群を BullMQ に enqueue する。
 *
 * - 未存在 → 404
 * - 非参加者 → 403
 * - 既に ENDED → 410
 * - 既に ACTIVE → 何もせず ok（idempotent。markActive と enqueue は冪等性が担保されているが、
 *   既に startedAt が確定しているケースで余計な書き込み / enqueue を避ける）
 * - COUNTDOWN → markActive で ACTIVE 化した後に enqueueSessionStart を呼ぶ。
 *   markActive を先に呼ぶのは「ACTIVE 化したのに enqueue 漏れ」を防ぐため。
 *   逆順だと enqueue 成功後の markActive 失敗で session が COUNTDOWN のままジョブだけ走るゾンビになる。
 *
 * 実ジョブ消化（テーマ配信 / タイマー配信 / タイムアウト）は step8b で `apps/matching-worker` 側に実装する。
 */
export const startMatchingSession = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
  enqueuer: { themeProgressEnqueuer: ThemeProgressEnqueuer },
): Promise<Result<StartMatchingSessionOutput>> => {
  logger.debug("MatchingService: startSession", {
    sessionId: input.sessionId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }
  if (session.status === "ENDED") return err(goneError("Session already ended"))

  /**
   * 既に ACTIVE の場合は冪等成功扱い。markActive / enqueue は呼ばない。
   * `startedAt` は markEnded を経由しない限り null に戻らないため非 null 想定。
   * 万一 null（DB 直接編集等）なら整合性破壊として throw する。
   */
  if (session.status === "ACTIVE") {
    if (!session.startedAt) {
      throw new Error(`MatchingSession is ACTIVE but startedAt is null: id=${session.id}`)
    }
    return ok({ sessionId: session.id, startedAt: session.startedAt })
  }

  const updated = await repo.matchingSessionRepository.markActive(input.sessionId)
  if (!updated.startedAt) {
    /** markActive 直後は必ず startedAt がセットされている（DB レイヤの不変条件） */
    throw new Error(`markActive returned null startedAt: id=${updated.id}`)
  }

  /**
   * ジョブ enqueue は決定的 jobId で冪等。markActive の後に呼ぶことで、ACTIVE 化に成功したのに
   * enqueue されないケースを防ぐ。enqueue 失敗時はクライアントへ 5xx が返り、再試行で
   * markActive は no-op、enqueue だけが補完される。
   */
  await enqueuer.themeProgressEnqueuer.enqueueSessionStart(input.sessionId)

  return ok({ sessionId: updated.id, startedAt: updated.startedAt })
}

/**
 * セッションを ENDED に遷移させる。
 *
 * `reason` で TIMEOUT / USER_LEFT / MANUAL を切替可能。Controller からは MANUAL のみ呼び、
 * step8 の自動終了は TIMEOUT、step9 の Webhook は USER_LEFT を渡す想定。
 *
 * - 未存在 → 404
 * - 非参加者 → 403
 * - 既に ENDED → 410 GONE
 * - reason=MANUAL かつ 5 分未満 → 400（spec1 の最低通話時間制約）
 *
 * Data Channel `matching:ended` の配信は本 step では扱わない（step8 / step9 で実施）。
 */
export const endMatchingSession = async (
  input: { reason: MatchingEndReason; sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
): Promise<Result<MatchingSession>> => {
  logger.debug("MatchingService: endSession", {
    reason: input.reason,
    sessionId: input.sessionId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }
  if (session.status === "ENDED") return err(goneError("Session already ended"))

  if (input.reason === "MANUAL") {
    const elapsedSeconds = computeElapsedSeconds(session.startedAt)
    if (elapsedSeconds < MATCHING_SESSION_MIN_END_SECONDS) {
      return err(badRequestError("Cannot end session before 5 minutes"))
    }
  }

  const updated = await repo.matchingSessionRepository.markEnded(input.sessionId, input.reason)
  return ok(updated)
}

/**
 * UI 用に整形した片側のリアクション選択肢。
 */
export type ReactionChoiceView = { id: number; label: string }

/**
 * `POST /api/matching/sessions/:id/reaction` の戻り値。
 *
 * - `matched`: 相手が同 round 未回答なら null。両者揃えば true / false
 * - `myChoice` / `peerChoice`: CHOICE テーマで両者揃ったときのみ非 null
 */
export type SubmitReactionOutput = {
    matched: boolean | null
    myChoice: ReactionChoiceView | null
    peerChoice: ReactionChoiceView | null
    reactionId: number
}

/**
 * `GET /api/matching/sessions/:id/reactions` の戻り値。1 ラウンドごとに正規化済。
 */
export type ReactionRoundView = {
    isMatch: boolean
    myChoice: ReactionChoiceView | null
    peerChoice: ReactionChoiceView | null
    roundNumber: number
    theme: { id: number; title: string; type: "CHOICE" | "FREE_TALK" }
}

export type GetReactionsOutput = { rounds: ReactionRoundView[] }

/**
 * Data Channel の topic 名。クライアントは購読時にこの値で分岐する。
 */
const REACTION_MATCH_TOPIC = "matching:reaction_match"

/**
 * choice → ReactionChoiceView 変換。null は素通り。
 */
const toChoiceView = (choice: TalkThemeChoice | null): ReactionChoiceView | null =>
  choice ? { id: choice.id, label: choice.label } : null

/**
 * `POST /api/matching/sessions/:id/reaction`
 *
 * 1. セッション参加者・status チェック（ENDED は 410）
 * 2. 同セッション同 round に既に回答していれば 409（unique 制約）
 * 3. theme を取得し、CHOICE テーマで choice_id=null は 400
 * 4. matching_reactions に保存
 * 5. 相手の同 round リアクションを検索
 *    - 揃ってない → matched=null で返す
 *    - 揃った かつ CHOICE → 一致判定 + Data Channel 配信 + my/peer の choice ラベル付き返却
 *    - 揃った かつ FREE_TALK → matched=null（一致判定なし）で返す
 */
export const submitReaction = async (
  input: {
    choiceId: number | null
    roundNumber: number
    sessionId: number
    themeId: number
    userId: number
  },
  repo: {
    matchingReactionRepository: MatchingReactionRepository
    matchingSessionRepository: MatchingSessionRepository
    talkThemeRepository: TalkThemeRepository
  },
  client: { livekitClient: ILiveKitClient },
): Promise<Result<SubmitReactionOutput>> => {
  logger.debug("MatchingService: submitReaction", {
    roundNumber: input.roundNumber,
    sessionId: input.sessionId,
    themeId: input.themeId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }
  if (session.status === "ENDED") return err(goneError("Session already ended"))

  /**
   * theme 取得 + CHOICE テーマで choice_id=null は 400。
   * 提示された choice_id がそのテーマに属するかの厳密検証は行わない（UI 側の選択肢から
   * 選ばせる前提 + DB FK で守られているため）。将来必要なら choices 配列で判定する。
   */
  const themeWithChoices = await repo.talkThemeRepository.findById(input.themeId)
  if (!themeWithChoices) return err(notFoundError("Theme not found"))
  if (themeWithChoices.theme.type === "CHOICE" && input.choiceId === null) {
    return err(badRequestError("choice_id is required for CHOICE theme"))
  }

  /**
   * 同 round 重複は DB の (sessionId, userId, roundNumber) unique で守られている。
   * 事前 SELECT を挟まず、Prisma のエラーコード P2002 を 409 に変換する。
   */
  let reaction
  try {
    reaction = await repo.matchingReactionRepository.create({
      choiceId: input.choiceId,
      roundNumber: input.roundNumber,
      sessionId: input.sessionId,
      themeId: input.themeId,
      userId: input.userId,
    })
  } catch (e: unknown) {
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return err(conflictError("Reaction already submitted for this round"))
    }
    throw e
  }

  const opponent = await repo.matchingReactionRepository.findOpponentInSameRound({
    myUserId: input.userId,
    roundNumber: input.roundNumber,
    sessionId: input.sessionId,
  })

  /** 相手未回答 → matched=null で返す */
  if (!opponent) {
    return ok({ matched: null, myChoice: null, peerChoice: null, reactionId: reaction.id })
  }

  /**
   * 両者揃ったケース。FREE_TALK は matched 概念が無いので null のまま。
   * CHOICE は choice id 一致で matched true/false を判定し、Data Channel に配信。
   */
  if (themeWithChoices.theme.type === "FREE_TALK") {
    return ok({ matched: null, myChoice: null, peerChoice: null, reactionId: reaction.id })
  }

  const myChoice = themeWithChoices.choices.find((c) => c.id === input.choiceId) ?? null
  const peerChoice = opponent.choice
  const matched = myChoice !== null && peerChoice !== null && myChoice.id === peerChoice.id

  /**
   * Data Channel 配信は失敗してもユーザーへのレスポンスは返す（best-effort）。
   * LiveKit 障害時にリアクション保存自体まで巻き戻すと UX が悪化するため、warn ログのみ残す。
   */
  try {
    await client.livekitClient.publishData({
      payload: {
        matched,
        round_number: input.roundNumber,
        theme_id: input.themeId,
        user1_choice_id: session.user1Id === input.userId ? myChoice?.id ?? null : peerChoice?.id ?? null,
        user2_choice_id: session.user2Id === input.userId ? myChoice?.id ?? null : peerChoice?.id ?? null,
      },
      roomName: session.livekitRoomName,
      topic: REACTION_MATCH_TOPIC,
    })
  } catch (error) {
    logger.warn("MatchingService: publishData failed for reaction_match", {
      error,
      sessionId: input.sessionId,
    })
  }

  return ok({
    matched,
    myChoice: toChoiceView(myChoice),
    peerChoice: toChoiceView(peerChoice),
    reactionId: reaction.id,
  })
}

/**
 * `GET /api/matching/sessions/:id/reactions`
 *
 * 全リアクションを round ごとにグルーピングし、各 round で自分 / 相手の choice と
 * is_match を計算して返す。相手未回答の round も含める（peer_choice=null）。
 */
export const getReactions = async (
  input: { sessionId: number; userId: number },
  repo: {
    matchingReactionRepository: MatchingReactionRepository
    matchingSessionRepository: MatchingSessionRepository
  },
): Promise<Result<GetReactionsOutput>> => {
  logger.debug("MatchingService: getReactions", {
    sessionId: input.sessionId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }

  const all = await repo.matchingReactionRepository.findAllForSession(input.sessionId)

  /** round ごとにまとめる。Map のキーは roundNumber、値は { theme, mine, peer } */
  type Bucket = {
        mine: { choice: TalkThemeChoice | null } | null
        peer: { choice: TalkThemeChoice | null } | null
        theme: { id: number; title: string; type: "CHOICE" | "FREE_TALK" }
    }
  const buckets = new Map<number, Bucket>()

  for (const r of all) {
    const themeView = { id: r.theme.id, title: r.theme.title, type: r.theme.type }
    const bucket: Bucket = buckets.get(r.reaction.roundNumber) ?? {
      mine: null,
      peer: null,
      theme: themeView,
    }
    if (r.reaction.userId === input.userId) {
      bucket.mine = { choice: r.choice }
    } else {
      bucket.peer = { choice: r.choice }
    }
    bucket.theme = themeView
    buckets.set(r.reaction.roundNumber, bucket)
  }

  const rounds: ReactionRoundView[] = Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([roundNumber, b]) => {
      const myChoice = toChoiceView(b.mine?.choice ?? null)
      const peerChoice = toChoiceView(b.peer?.choice ?? null)
      const isMatch =
                b.theme.type === "CHOICE" &&
                myChoice !== null &&
                peerChoice !== null &&
                myChoice.id === peerChoice.id
      return {
        isMatch,
        myChoice,
        peerChoice,
        roundNumber,
        theme: b.theme,
      }
    })

  return ok({ rounds })
}

/**
 * `POST /api/matching/sessions/:id/stamp` の戻り値。
 *
 * - `deliveredAt`: Data Channel publish した unix epoch ms
 * - `emoji` / `animationType`: 自分の画面でも同じ表示を再現できるようレスポンスに含める
 */
export type SendMatchingStampOutput = {
    animationType: StampAnimationType
    deliveredAt: number
    emoji: string
    itemId: number
}

/**
 * 1 ユーザーあたりのスタンプ送信レート上限（1 秒ウィンドウ）。
 * spec1 の「5 req/秒」。Service 側で拒否し、Controller は 429 を返す。
 */
const STAMP_RATE_LIMIT_PER_SEC = 5

/**
 * Data Channel topic 名。クライアントは購読時にこの値で分岐し
 * `<StampFloatLayer>` 等の表示エフェクトを発火する。
 */
const STAMP_TOPIC = "matching:stamp"

/**
 * Redis key の生成。ユーザー単位で 1 秒ウィンドウのレート制限に使う。
 * セッション単位ではなくユーザー単位なのは、複数セッションを同時に持たない仕様前提。
 */
const stampRateLimitKey = (userId: number): string => `stamp_rate:${userId}`

/**
 * セッション中にスタンプを送る。`item_id` は MATCHING スコープのスタンプであり、
 * プレミアムなら user_inventory に所持が必要。1 ユーザー 5 req/秒のレート制限。
 *
 * 1. セッション参加者・status チェック（ENDED は 410）
 * 2. レート制限超過 → 429
 * 3. item 検証（type=STAMP / scope=MATCHING / is_active）→ 不一致なら 400
 * 4. premium なら user_inventory チェック → なければ 403
 * 5. Data Channel `matching:stamp` を Room 全体に publish
 * 6. ok({ itemId, emoji, animationType, deliveredAt })
 *
 * DB には保存しない（揮発的）。永続化は将来 `matching_stamps` 追加で対応。
 */
export const sendMatchingStamp = async (
  input: { itemId: number; sessionId: number; userId: number },
  repo: {
    itemRepository: ItemRepository
    matchingSessionRepository: MatchingSessionRepository
    rateLimitRedisRepository: RateLimitRedisRepository
    userInventoryRepository: UserInventoryRepository
  },
  client: { livekitClient: ILiveKitClient },
): Promise<Result<SendMatchingStampOutput>> => {
  logger.debug("MatchingService: sendStamp", {
    itemId: input.itemId,
    sessionId: input.sessionId,
    userId: input.userId,
  })

  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (!isParticipant(session, input.userId)) {
    return err(forbiddenError("Not a participant of this session"))
  }
  if (session.status === "ENDED") return err(goneError("Session already ended"))

  /**
   * レート制限チェックは item / inventory のクエリより前に置き、最も安いリクエストから弾く。
   */
  const allowed = await repo.rateLimitRedisRepository.incrementWithLimit(
    stampRateLimitKey(input.userId),
    STAMP_RATE_LIMIT_PER_SEC,
  )
  if (!allowed) return err(tooManyRequestsError("Stamp rate limit exceeded"))

  const stamp = await repo.itemRepository.findActiveStampForMatching(input.itemId)
  if (!stamp) return err(badRequestError("Invalid stamp item"))

  if (stamp.isPremium) {
    const owned = await repo.userInventoryRepository.hasItem(input.userId, input.itemId)
    if (!owned) return err(forbiddenError("Premium stamp not owned"))
  }

  const deliveredAt = Date.now()
  /**
   * Data Channel 配信は best-effort。失敗してもユーザーへの 200 は返す（リアクションと同じ方針）。
   * LiveKit 障害時に発火し過ぎないよう warn ログのみで観測可能にする。
   */
  try {
    await client.livekitClient.publishData({
      payload: {
        animation_type: stamp.animationType,
        emoji: stamp.emoji,
        item_id: stamp.id,
        sender_id: input.userId,
      },
      roomName: session.livekitRoomName,
      topic: STAMP_TOPIC,
    })
  } catch (error) {
    logger.warn("MatchingService: publishData failed for stamp", {
      error,
      sessionId: input.sessionId,
    })
  }

  return ok({
    animationType: stamp.animationType,
    deliveredAt,
    emoji: stamp.emoji,
    itemId: stamp.id,
  })
}

/**
 * マッチングセッションで使えるスタンプ一覧を取得する。
 *
 * - `is_active=true` + MATCHING scope を含むスタンプを sortOrder 昇順で返す
 * - 認証必須（呼び出し側で middleware が担保）。session 参加者かどうかの厳密チェックは
 *   行わない（一覧は match 前の preload にも使えるよう公開的な扱いで OK）
 * - premium スタンプも一覧に含める。送信時に user_inventory チェックが入る
 */
export const getMatchingStamps = async (
  repo: { itemRepository: ItemRepository },
): Promise<Result<{ stamps: StampForMatching[] }>> => {
  logger.debug("MatchingService: getMatchingStamps")
  const stamps = await repo.itemRepository.findManyActiveStampsForMatching()
  return ok({ stamps })
}
