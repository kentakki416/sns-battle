import { MatchingSessionRepository } from "../../../src/repository/prisma"
import { ThemeProgressEnqueuer } from "../../../src/repository/queue"
import { startMatchingSession } from "../../../src/service/matching-service"
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

describe("startMatchingSession", () => {
  const buildRepos = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    const themeProgressEnqueuer: ThemeProgressEnqueuer = {
      enqueueSessionStart: jest.fn(),
    }
    return { enqueuer: { themeProgressEnqueuer }, repo: { matchingSessionRepository } }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("【異常系】session が存在しない → 404 / markActive・enqueue とも呼ばれない", async () => {
    const { repo, enqueuer } = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await startMatchingSession({ sessionId: 999, userId: 1 }, repo, enqueuer)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
    expect(repo.matchingSessionRepository.markActive).not.toHaveBeenCalled()
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).not.toHaveBeenCalled()
  })

  it("【異常系】非参加者 → 403 / markActive・enqueue とも呼ばれない", async () => {
    const { repo, enqueuer } = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await startMatchingSession({ sessionId: 100, userId: 99 }, repo, enqueuer)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
    expect(repo.matchingSessionRepository.markActive).not.toHaveBeenCalled()
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).not.toHaveBeenCalled()
  })

  it("【異常系】既に ENDED → 410 / markActive・enqueue とも呼ばれない", async () => {
    const { repo, enqueuer } = buildRepos()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "ENDED" }),
    )

    const result = await startMatchingSession({ sessionId: 100, userId: 1 }, repo, enqueuer)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(410)
      expect(result.error.type).toBe("GONE")
    }
    expect(repo.matchingSessionRepository.markActive).not.toHaveBeenCalled()
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).not.toHaveBeenCalled()
  })

  it("【正常系】既に ACTIVE → ok / markActive・enqueue とも呼ばれず既存 startedAt を返す", async () => {
    const { repo, enqueuer } = buildRepos()
    const startedAt = new Date(Date.now() - 60_000)
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ startedAt, status: "ACTIVE" }),
    )

    const result = await startMatchingSession({ sessionId: 100, userId: 1 }, repo, enqueuer)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ sessionId: 100, startedAt })
    }
    expect(repo.matchingSessionRepository.markActive).not.toHaveBeenCalled()
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).not.toHaveBeenCalled()
  })

  it("【正常系】正常系（COUNTDOWN → ACTIVE） → markActive 1 回 / enqueue 1 回 / 新しい startedAt を返す", async () => {
    const { repo, enqueuer } = buildRepos()
    const newStartedAt = new Date()
    ;(repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "COUNTDOWN" }),
    )
    ;(repo.matchingSessionRepository.markActive as jest.Mock).mockResolvedValue(
      buildSession({ startedAt: newStartedAt, status: "ACTIVE" }),
    )

    const result = await startMatchingSession({ sessionId: 100, userId: 1 }, repo, enqueuer)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ sessionId: 100, startedAt: newStartedAt })
    }
    expect(repo.matchingSessionRepository.markActive).toHaveBeenCalledTimes(1)
    expect(repo.matchingSessionRepository.markActive).toHaveBeenCalledWith(100)
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).toHaveBeenCalledTimes(1)
    expect(enqueuer.themeProgressEnqueuer.enqueueSessionStart).toHaveBeenCalledWith(100)
  })
})
