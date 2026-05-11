import {
  BlockRepository,
  MatchingPreferenceRepository,
  MatchingQueueRepository,
  MatchingSessionRepository,
  TransactionContext,
  TransactionRunner,
  UserRepository,
} from "../../../src/repository/prisma"
import {
  MatchingEventPublisher,
  MatchingQueueRedisRepository,
} from "../../../src/repository/redis"
import { joinMatching } from "../../../src/service/matching-service"
import {
  MatchingPreference,
  MatchingQueue,
  MatchingSession,
  User,
} from "../../../src/types/domain"

const buildUser = (overrides?: Partial<User>): User => ({
  avatarUrl: null,
  bio: null,
  birthDate: new Date("1995-01-01"),
  coinBalance: 0,
  createdAt: new Date(),
  email: "u@example.com",
  gender: "FEMALE",
  id: 1,
  isOnboarded: true,
  location: null,
  mbti: null,
  name: "User",
  updatedAt: new Date(),
  ...overrides,
})

const buildPref = (overrides?: Partial<MatchingPreference>): MatchingPreference => ({
  ageMax: null,
  ageMin: null,
  id: 1,
  preferredGenders: [],
  preferredHobbyIds: [],
  preferredLocations: [],
  preferredMbti: [],
  userId: 1,
  ...overrides,
})

const buildSession = (overrides?: Partial<MatchingSession>): MatchingSession => ({
  createdAt: new Date(),
  endedAt: null,
  endReason: null,
  id: 100,
  livekitRoomName: "matching:100",
  startedAt: null,
  status: "COUNTDOWN",
  user1Id: 1,
  user2Id: 2,
  ...overrides,
})

const buildQueue = (userId: number): MatchingQueue => ({
  createdAt: new Date(),
  id: 1,
  status: "WAITING",
  updatedAt: new Date(),
  userId,
})

describe("joinMatching", () => {
  const buildRepos = () => {
    const userRepository: UserRepository = {
      completeOnboarding: jest.fn(),
      create: jest.fn(),
      findByEmail: jest.fn(),
      findById: jest.fn(),
      findManyByIds: jest.fn().mockResolvedValue([]),
      /**
       * デフォルトでは「呼ばれた id の User と空の hobbies」を返す。
       * 具体的なプロフィール内容を検証するテストでは個別に上書きする。
       */
      findProfileById: jest.fn().mockImplementation(async (id: number) => ({
        hobbies: [],
        user: buildUser({ id }),
      })),
      update: jest.fn(),
    }
    const matchingQueueRedisRepository: MatchingQueueRedisRepository = {
      add: jest.fn(),
      findJoinedAt: jest.fn(),
      findPosition: jest.fn(),
      findTopWaitingUsers: jest.fn().mockResolvedValue([]),
      remove: jest.fn(),
      removeBothAtomic: jest.fn(),
    }
    const matchingQueueRepository: MatchingQueueRepository = {
      deleteByUserId: jest.fn(),
      findByUserId: jest.fn(),
      upsertWaiting: jest.fn(),
    }
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    const blockRepository: BlockRepository = {
      existsBetween: jest.fn(),
      findBlockedUserIds: jest.fn().mockResolvedValue(new Set()),
    }
    const matchingPreferenceRepository: MatchingPreferenceRepository = {
      findByUserId: jest.fn().mockResolvedValue(null),
      findManyByUserIds: jest.fn().mockResolvedValue(new Map()),
      upsertByUserId: jest.fn(),
    }
    const matchingEventPublisher: MatchingEventPublisher = { publishMatched: jest.fn() }
    /**
     * Fake TransactionRunner: callback をそのまま実行する。
     * Service の挙動検証では実 tx 不要なため、tx 引数として undefined を渡し、
     * Repository は tx 無し経路で動く。
     */
    const transactionRunner: TransactionRunner = {
      run: jest.fn(async (fn) => fn(undefined as unknown as TransactionContext)),
    }
    return {
      blockRepository,
      matchingEventPublisher,
      matchingPreferenceRepository,
      matchingQueueRedisRepository,
      matchingQueueRepository,
      matchingSessionRepository,
      transactionRunner,
      userRepository,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  /** 共通: 1 件の peer (id=2) がキューに居て、ブロックも preference 制限も無い状態にセット */
  const setupBasicMatch = (
    repo: ReturnType<typeof buildRepos>,
    options?: {
      me?: User
      peer?: User
      myPref?: MatchingPreference | null
      peerPref?: MatchingPreference | null
    },
  ) => {
    const me = options?.me ?? buildUser({ id: 1 })
    const peer = options?.peer ?? buildUser({ avatarUrl: "https://x", id: 2, name: "Peer" })
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingQueueRepository.upsertWaiting as jest.Mock).mockResolvedValue(buildQueue(1))
    ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([peer.id])
    ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set())
    ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([peer])
    ;(repo.matchingPreferenceRepository.findManyByUserIds as jest.Mock).mockResolvedValue(
      options?.peerPref ? new Map([[peer.id, options.peerPref]]) : new Map(),
    )
    ;(repo.matchingPreferenceRepository.findByUserId as jest.Mock).mockResolvedValue(
      options?.myPref ?? null,
    )
    ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
      buildSession({ id: 100, livekitRoomName: "matching:100", user1Id: 1, user2Id: peer.id }),
    )
    /** デフォルトでは hobbies=[] のプロフィールを返す。テスト個別で上書き可。 */
    ;(repo.userRepository.findProfileById as jest.Mock).mockResolvedValue({
      hobbies: [],
      user: peer,
    })
    return { me, peer }
  }

  describe("前提チェック", () => {
    it("【異常系】user not found → 404 NOT_FOUND", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
      }
      expect(repo.matchingQueueRedisRepository.add).not.toHaveBeenCalled()
    })

    it("【異常系】isOnboarded=false → 400 BAD_REQUEST", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(
        buildUser({ isOnboarded: false }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
      }
    })

    it("【異常系】既にアクティブセッション保持 → 409 CONFLICT、Redis のゾンビも掃除", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser())
      ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock).mockResolvedValue(
        buildSession({ id: 999, user1Id: 1, user2Id: 2 }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatchObject({ statusCode: 409, type: "CONFLICT" })
      }
      /** ゾンビ Redis エントリの掃除のため remove が呼ばれる */
      expect(repo.matchingQueueRedisRepository.remove).toHaveBeenCalledWith(1)
      /** ZADD は呼ばれない */
      expect(repo.matchingQueueRedisRepository.add).not.toHaveBeenCalled()
    })

    it("【異常系】既に WAITING（add=false） → 409 CONFLICT", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser())
      ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(false)

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatchObject({ statusCode: 409, type: "CONFLICT" })
      }
    })
  })

  describe("候補ゼロ", () => {
    it("【正常系】待機者が自分しかいない → matched=false、DB に WAITING 登録", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser())
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([])

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
      expect(repo.matchingQueueRepository.upsertWaiting).toHaveBeenCalledWith(1)
      expect(repo.matchingSessionRepository.create).not.toHaveBeenCalled()
    })
  })

  describe("成立パス", () => {
    it("【正常系】候補 1 名・制限なし → matched=true、両者キュー削除 + セッション作成 + publishMatched", async () => {
      const repo = buildRepos()
      const { peer } = setupBasicMatch(repo)

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({
          livekitRoomName: "matching:100",
          matched: true,
          peer: {
            id: peer.id,
            age: expect.any(Number),
            avatarUrl: "https://x",
            bio: null,
            gender: "FEMALE",
            hobbies: [],
            location: null,
            mbti: null,
            name: "Peer",
          },
          sessionId: 100,
        })
      }
      /** fake runner は tx として undefined を渡すので、第2引数は undefined */
      expect(repo.matchingSessionRepository.create).toHaveBeenCalledWith(
        { user1Id: 1, user2Id: 2 },
        undefined,
      )
      expect(repo.matchingQueueRepository.deleteByUserId).toHaveBeenCalledWith(1, undefined)
      expect(repo.matchingQueueRepository.deleteByUserId).toHaveBeenCalledWith(2, undefined)
      expect(repo.transactionRunner.run).toHaveBeenCalledTimes(1)
      expect(repo.matchingEventPublisher.publishMatched).toHaveBeenCalledWith([1, 2], {
        livekitRoomName: "matching:100",
        peer: expect.objectContaining({
          id: 2,
          age: expect.any(Number),
          avatarUrl: "https://x",
          gender: "FEMALE",
          hobbies: [],
          name: "Peer",
        }),
        sessionId: 100,
      })
    })

    it("【正常系】findProfileById が hobbies を返す → peer に hobbies が反映される", async () => {
      const repo = buildRepos()
      const peer = buildUser({ avatarUrl: "https://x", id: 2, name: "Peer" })
      setupBasicMatch(repo, { peer })
      ;(repo.userRepository.findProfileById as jest.Mock).mockResolvedValue({
        hobbies: [
          { id: 1, name: "音楽", sortOrder: 1 },
          { id: 2, name: "ゲーム", sortOrder: 2 },
        ],
        user: peer,
      })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok && result.value.matched) {
        expect(result.value.peer.hobbies).toEqual([
          { id: 1, name: "音楽" },
          { id: 2, name: "ゲーム" },
        ])
      }
    })
  })

  describe("ブロック関係のスキップ", () => {
    it("【正常系】最古ユーザーがブロック相手 → 次の候補にフォールバックして成立", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1 })
      const blockedPeer = buildUser({ id: 2 })
      const okPeer = buildUser({ avatarUrl: "https://x", id: 3, name: "OK" })
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set([blockedPeer.id]))
      ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([okPeer])
      ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
        buildSession({ id: 100, livekitRoomName: "matching:100", user1Id: 1, user2Id: 3 }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok && result.value.matched) {
        expect(result.value.peer.id).toBe(3)
      }
      /** ブロック相手 (id=2) は findManyByIds に渡らない（事前に除外） */
      expect(repo.userRepository.findManyByIds).toHaveBeenCalledWith([3])
      /** ブロック相手と removeBothAtomic を呼ばないこと */
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalledWith(1, 2)
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).toHaveBeenCalledWith(1, 3)
    })

    it("【異常系】候補全員がブロック相手 → matched=false", async () => {
      const repo = buildRepos()
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser({ id: 1 }))
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set([2, 3]))

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
      expect(repo.userRepository.findManyByIds).not.toHaveBeenCalled()
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalled()
    })
  })

  describe("preference フィルタ - 性別", () => {
    it("【正常系】自分の preference に相手の gender が含まれない → 不成立", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1, gender: "MALE" })
      const peer = buildUser({ gender: "MALE", id: 2 })
      const myPref = buildPref({ preferredGenders: ["FEMALE"], userId: 1 })
      setupBasicMatch(repo, { me, myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalled()
    })

    it("【正常系】相手の preference に自分の gender が含まれない → 不成立（双方向）", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1, gender: "MALE" })
      const peer = buildUser({ gender: "FEMALE", id: 2 })
      const peerPref = buildPref({ preferredGenders: ["FEMALE"], userId: 2 })
      setupBasicMatch(repo, { me, peer, peerPref })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })

    it("【正常系】preference 空配列は無制限 → 成立", async () => {
      const repo = buildRepos()
      const myPref = buildPref({ preferredGenders: [], userId: 1 })
      setupBasicMatch(repo, { myPref })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.matched).toBe(true)
    })

    it("【正常系】両者 preference に gender が含まれる → 成立", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1, gender: "MALE" })
      const peer = buildUser({ gender: "FEMALE", id: 2 })
      const myPref = buildPref({ preferredGenders: ["FEMALE"], userId: 1 })
      const peerPref = buildPref({ preferredGenders: ["MALE"], userId: 2 })
      setupBasicMatch(repo, { me, myPref, peer, peerPref })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.matched).toBe(true)
    })

    it("【正常系】相手の gender が null かつ preference 制限あり → 不成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ gender: null, id: 2 })
      const myPref = buildPref({ preferredGenders: ["FEMALE"], userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })
  })

  describe("preference フィルタ - 年齢", () => {
    /** 1995-01-01 生まれ = 2026-05-10 時点で 31 歳 */
    it("【正常系】相手の年齢が ageMin 未満 → 不成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ birthDate: new Date("2010-01-01"), id: 2 })
      const myPref = buildPref({ ageMin: 20, userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })

    it("【正常系】相手の年齢が ageMax 超過 → 不成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ birthDate: new Date("1980-01-01"), id: 2 })
      const myPref = buildPref({ ageMax: 30, userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })

    it("【正常系】相手の年齢が ageMin..ageMax の範囲内 → 成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ birthDate: new Date("2000-01-01"), id: 2 })
      const myPref = buildPref({ ageMax: 30, ageMin: 20, userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.matched).toBe(true)
    })

    it("【正常系】相手の birthDate が null かつ年齢制限あり → 不成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ birthDate: null, id: 2 })
      const myPref = buildPref({ ageMin: 20, userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })
  })

  describe("preference フィルタ - 居住地域", () => {
    it("【正常系】自分の preferredLocations に相手の location が含まれない → 不成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ id: 2, location: "Osaka" })
      const myPref = buildPref({ preferredLocations: ["Tokyo"], userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
    })

    it("【正常系】相手の location が含まれる → 成立", async () => {
      const repo = buildRepos()
      const peer = buildUser({ id: 2, location: "Tokyo" })
      const myPref = buildPref({ preferredLocations: ["Tokyo", "Osaka"], userId: 1 })
      setupBasicMatch(repo, { myPref, peer })

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value.matched).toBe(true)
    })
  })

  describe("多段照合", () => {
    it("【正常系】preference 不適合の候補をスキップして 2 番目で成立", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1, gender: "MALE" })
      const ngPeer = buildUser({ gender: "MALE", id: 2 })
      const okPeer = buildUser({ avatarUrl: "https://x", gender: "FEMALE", id: 3, name: "OK" })
      const myPref = buildPref({ preferredGenders: ["FEMALE"], userId: 1 })
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set())
      ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([ngPeer, okPeer])
      ;(repo.matchingPreferenceRepository.findByUserId as jest.Mock).mockResolvedValue(myPref)
      ;(repo.matchingPreferenceRepository.findManyByUserIds as jest.Mock).mockResolvedValue(new Map())
      ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
        buildSession({ id: 100, user1Id: 1, user2Id: 3 }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok && result.value.matched) {
        expect(result.value.peer.id).toBe(3)
      }
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalledWith(1, 2)
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).toHaveBeenCalledWith(1, 3)
    })

    it("【正常系】removeBothAtomic 競合の場合は次の候補にリトライ", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1 })
      const peerA = buildUser({ id: 2 })
      const peerB = buildUser({ avatarUrl: "https://b", id: 3, name: "B" })
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set())
      ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([peerA, peerB])
      ;(repo.matchingPreferenceRepository.findByUserId as jest.Mock).mockResolvedValue(null)
      ;(repo.matchingPreferenceRepository.findManyByUserIds as jest.Mock).mockResolvedValue(new Map())
      /** peer A は競合で removeBothAtomic 失敗、peer B は成功 */
      ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true)
      ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
        buildSession({ user1Id: 1, user2Id: 3 }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok && result.value.matched) expect(result.value.peer.id).toBe(3)
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).toHaveBeenCalledTimes(2)
    })

    it("【正常系】最古候補がゾンビ（既にアクティブセッション保持）→ Redis 掃除して次候補で成立", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1 })
      const zombiePeer = buildUser({ id: 2 })
      const okPeer = buildUser({ avatarUrl: "https://x", id: 3, name: "OK" })
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([zombiePeer, okPeer])
      /** zombiePeer は active session 保持、自分と okPeer は持たない */
      ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock)
        .mockImplementation(async (id: number) =>
          id === zombiePeer.id ? buildSession({ id: 9, user1Id: 2, user2Id: 9 }) : null,
        )
      ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
        buildSession({ user1Id: 1, user2Id: 3 }),
      )

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok && result.value.matched) expect(result.value.peer.id).toBe(3)
      /** zombiePeer (id=2) の Redis エントリは掃除される */
      expect(repo.matchingQueueRedisRepository.remove).toHaveBeenCalledWith(2)
      /** zombiePeer に対しては removeBothAtomic を呼ばない */
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalledWith(1, 2)
      expect(repo.matchingQueueRedisRepository.removeBothAtomic).toHaveBeenCalledWith(1, 3)
    })

    it("【異常系】候補全員が removeBothAtomic 競合敗北 → matched=false", async () => {
      const repo = buildRepos()
      const me = buildUser({ id: 1 })
      const peerA = buildUser({ id: 2 })
      const peerB = buildUser({ id: 3 })
      ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(me)
      ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
      ;(repo.matchingQueueRedisRepository.findTopWaitingUsers as jest.Mock).mockResolvedValue([2, 3])
      ;(repo.userRepository.findManyByIds as jest.Mock).mockResolvedValue([peerA, peerB])
      ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(false)

      const result = await joinMatching(1, repo)

      expect(result.ok).toBe(true)
      if (result.ok) expect(result.value).toEqual({ matched: false })
      expect(repo.matchingSessionRepository.create).not.toHaveBeenCalled()
    })
  })
})
