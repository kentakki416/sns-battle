import {
  MatchingSessionRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { getMatchingSession } from "../../../src/service/matching-service"
import { MatchingSession, User } from "../../../src/types/domain"

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

const buildUser = (overrides?: Partial<User>): User => ({
  avatarUrl: null,
  bio: null,
  birthDate: null,
  coinBalance: 0,
  createdAt: new Date(),
  email: "x@example.com",
  gender: null,
  id: 1,
  isOnboarded: true,
  location: null,
  mbti: null,
  name: "User",
  updatedAt: new Date(),
  ...overrides,
})

describe("getMatchingSession", () => {
  const buildRepos = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    const userRepository: Partial<UserRepository> = {
      findById: jest.fn(),
    }
    return {
      matchingSessionRepository,
      userRepository: userRepository as UserRepository,
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("user1 として取得 → ok かつ is_self_user1=true", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "COUNTDOWN", user1Id: 1, user2Id: 2 }),
    )
    ;(repo.userRepository.findById as jest.Mock)
      .mockResolvedValueOnce(buildUser({ avatarUrl: "a1", id: 1, name: "U1" }))
      .mockResolvedValueOnce(buildUser({ avatarUrl: "a2", id: 2, name: "U2" }))

    const result = await getMatchingSession({ sessionId: 100, userId: 1 }, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        canEndNow: false,
        elapsedSeconds: 0,
        isSelfUser1: true,
        session: expect.objectContaining({ id: 100, status: "COUNTDOWN" }),
        user1: { id: 1, avatarUrl: "a1", name: "U1" },
        user2: { id: 2, avatarUrl: "a2", name: "U2" },
      })
    }
  })

  it("user2 として取得 → is_self_user1=false", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )
    ;(repo.userRepository.findById as jest.Mock)
      .mockResolvedValueOnce(buildUser({ id: 1 }))
      .mockResolvedValueOnce(buildUser({ id: 2 }))

    const result = await getMatchingSession({ sessionId: 100, userId: 2 }, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isSelfUser1).toBe(false)
    }
  })

  it("ACTIVE で 5 分以上経過 → can_end_now=true", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 6 * 60 * 1000) // 6 分前
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 }),
    )
    ;(repo.userRepository.findById as jest.Mock)
      .mockResolvedValueOnce(buildUser({ id: 1 }))
      .mockResolvedValueOnce(buildUser({ id: 2 }))

    const result = await getMatchingSession({ sessionId: 100, userId: 1 }, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.canEndNow).toBe(true)
      expect(result.value.elapsedSeconds).toBeGreaterThanOrEqual(360)
    }
  })

  it("ACTIVE だが 5 分未満 → can_end_now=false", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 30 * 1000) // 30 秒前
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 }),
    )
    ;(repo.userRepository.findById as jest.Mock)
      .mockResolvedValueOnce(buildUser({ id: 1 }))
      .mockResolvedValueOnce(buildUser({ id: 2 }))

    const result = await getMatchingSession({ sessionId: 100, userId: 1 }, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.canEndNow).toBe(false)
    }
  })

  it("非参加者 → 403", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await getMatchingSession({ sessionId: 100, userId: 99 }, repo)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
    expect(repo.userRepository.findById).not.toHaveBeenCalled()
  })

  it("存在しないセッション → 404", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await getMatchingSession({ sessionId: 999, userId: 1 }, repo)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
  })
})
