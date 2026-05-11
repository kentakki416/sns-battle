import { MatchingSessionRepository } from "../../../src/repository/prisma"
import { endMatchingSession } from "../../../src/service/matching-service"
import { MatchingSession } from "../../../src/types/domain"

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

describe("endMatchingSession", () => {
  const buildRepos = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    return { matchingSessionRepository }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("【正常系】MANUAL + 5 分以上経過 + 参加者本人 → ok / markEnded 呼び出し", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 6 * 60 * 1000)
    const baseSession = buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 })
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(baseSession)
    ;(repo.matchingSessionRepository.markEnded as jest.Mock).mockResolvedValue({
      ...baseSession,
      endedAt: new Date(),
      endReason: "MANUAL",
      status: "ENDED",
    })

    const result = await endMatchingSession(
      { reason: "MANUAL", sessionId: 100, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(true)
    expect(repo.matchingSessionRepository.markEnded).toHaveBeenCalledWith(100, "MANUAL")
  })

  it("【異常系】MANUAL + 5 分未満 → 400", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 60 * 1000)
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 }),
    )

    const result = await endMatchingSession(
      { reason: "MANUAL", sessionId: 100, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.matchingSessionRepository.markEnded).not.toHaveBeenCalled()
  })

  it("【正常系】TIMEOUT は 5 分制約を適用せず終了できる", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 30 * 1000)
    const baseSession = buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 })
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(baseSession)
    ;(repo.matchingSessionRepository.markEnded as jest.Mock).mockResolvedValue({
      ...baseSession,
      endedAt: new Date(),
      endReason: "TIMEOUT",
      status: "ENDED",
    })

    const result = await endMatchingSession(
      { reason: "TIMEOUT", sessionId: 100, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(true)
    expect(repo.matchingSessionRepository.markEnded).toHaveBeenCalledWith(100, "TIMEOUT")
  })

  it("【正常系】USER_LEFT も 5 分制約を適用しない", async () => {
    const repo = buildRepos()
    const startedAt = new Date(Date.now() - 30 * 1000)
    const baseSession = buildSession({ startedAt, status: "ACTIVE", user1Id: 1, user2Id: 2 })
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(baseSession)
    ;(repo.matchingSessionRepository.markEnded as jest.Mock).mockResolvedValue({
      ...baseSession,
      endedAt: new Date(),
      endReason: "USER_LEFT",
      status: "ENDED",
    })

    const result = await endMatchingSession(
      { reason: "USER_LEFT", sessionId: 100, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(true)
  })

  it("【異常系】既に ENDED → 410", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "ENDED", user1Id: 1, user2Id: 2 }),
    )

    const result = await endMatchingSession(
      { reason: "MANUAL", sessionId: 100, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(410)
      expect(result.error.type).toBe("GONE")
    }
    expect(repo.matchingSessionRepository.markEnded).not.toHaveBeenCalled()
  })

  it("【異常系】非参加者 → 403", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await endMatchingSession(
      { reason: "MANUAL", sessionId: 100, userId: 99 },
      repo,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
  })

  it("【異常系】存在しない → 404", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await endMatchingSession(
      { reason: "MANUAL", sessionId: 999, userId: 1 },
      repo,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
  })
})
