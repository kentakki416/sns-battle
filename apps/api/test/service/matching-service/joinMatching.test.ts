import {
  BlockRepository,
  MatchingQueueRepository,
  MatchingSessionRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { MatchingQueueRedisRepository } from "../../../src/repository/redis"
import { joinMatching } from "../../../src/service/matching-service"
import {
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
      findProfileById: jest.fn(),
      update: jest.fn(),
    }
    const matchingQueueRedisRepository: MatchingQueueRedisRepository = {
      add: jest.fn(),
      findJoinedAt: jest.fn(),
      findOldestPeer: jest.fn(),
      findPosition: jest.fn(),
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
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
    }
    const blockRepository: BlockRepository = { existsBetween: jest.fn() }
    return {
      blockRepository,
      matchingQueueRedisRepository,
      matchingQueueRepository,
      matchingSessionRepository,
      userRepository,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("user not found → 404 NOT_FOUND", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
    expect(repo.matchingQueueRedisRepository.add).not.toHaveBeenCalled()
  })

  it("isOnboarded=false → 400 BAD_REQUEST", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(
      buildUser({ isOnboarded: false }),
    )

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(repo.matchingQueueRedisRepository.add).not.toHaveBeenCalled()
  })

  it("既に WAITING（add が false） → 409 CONFLICT", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser())
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(false)

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 409, type: "CONFLICT" })
    }
  })

  it("待機者ゼロ → matched: false、DB に WAITING 登録", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser())
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingQueueRepository.upsertWaiting as jest.Mock).mockResolvedValue(buildQueue(1))
    ;(repo.matchingQueueRedisRepository.findOldestPeer as jest.Mock).mockResolvedValue(null)

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ matched: false })
    expect(repo.matchingQueueRepository.upsertWaiting).toHaveBeenCalledWith(1)
    expect(repo.matchingSessionRepository.create).not.toHaveBeenCalled()
  })

  it("ブロック関係あり → matched: false（自分は WAITING のまま）", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser({ id: 1 }))
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingQueueRepository.upsertWaiting as jest.Mock).mockResolvedValue(buildQueue(1))
    ;(repo.matchingQueueRedisRepository.findOldestPeer as jest.Mock).mockResolvedValue(2)
    ;(repo.blockRepository.existsBetween as jest.Mock).mockResolvedValue(true)

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ matched: false })
    expect(repo.matchingQueueRedisRepository.removeBothAtomic).not.toHaveBeenCalled()
    expect(repo.matchingSessionRepository.create).not.toHaveBeenCalled()
  })

  it("マッチング成立 → matched: true、両者キュー削除 + セッション作成", async () => {
    const repo = buildRepos()
    const me = buildUser({ id: 1 })
    const peer = buildUser({ avatarUrl: "https://x", id: 2, name: "Peer" })
    ;(repo.userRepository.findById as jest.Mock)
      .mockResolvedValueOnce(me)
      .mockResolvedValueOnce(peer)
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingQueueRepository.upsertWaiting as jest.Mock).mockResolvedValue(buildQueue(1))
    ;(repo.matchingQueueRedisRepository.findOldestPeer as jest.Mock).mockResolvedValue(2)
    ;(repo.blockRepository.existsBetween as jest.Mock).mockResolvedValue(false)
    ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingSessionRepository.create as jest.Mock).mockResolvedValue(
      buildSession({ id: 100, livekitRoomName: "matching:100", user1Id: 1, user2Id: 2 }),
    )

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        livekitRoomName: "matching:100",
        matched: true,
        peer: { avatarUrl: "https://x", id: 2, name: "Peer" },
        sessionId: 100,
      })
    }
    expect(repo.matchingSessionRepository.create).toHaveBeenCalledWith({ user1Id: 1, user2Id: 2 })
    expect(repo.matchingQueueRepository.deleteByUserId).toHaveBeenCalledWith(1)
    expect(repo.matchingQueueRepository.deleteByUserId).toHaveBeenCalledWith(2)
  })

  it("removeBothAtomic 競合 → matched: false（セッション作成しない）", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(buildUser({ id: 1 }))
    ;(repo.matchingQueueRedisRepository.add as jest.Mock).mockResolvedValue(true)
    ;(repo.matchingQueueRepository.upsertWaiting as jest.Mock).mockResolvedValue(buildQueue(1))
    ;(repo.matchingQueueRedisRepository.findOldestPeer as jest.Mock).mockResolvedValue(2)
    ;(repo.blockRepository.existsBetween as jest.Mock).mockResolvedValue(false)
    ;(repo.matchingQueueRedisRepository.removeBothAtomic as jest.Mock).mockResolvedValue(false)

    const result = await joinMatching(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual({ matched: false })
    expect(repo.matchingSessionRepository.create).not.toHaveBeenCalled()
  })
})
