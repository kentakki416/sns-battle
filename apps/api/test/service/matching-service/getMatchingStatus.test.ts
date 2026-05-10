import { MatchingSessionRepository } from "../../../src/repository/prisma"
import { MatchingQueueRedisRepository } from "../../../src/repository/redis"
import { getMatchingStatus } from "../../../src/service/matching-service"
import { MatchingSession } from "../../../src/types/domain"

const buildSession = (overrides?: Partial<MatchingSession>): MatchingSession => ({
  createdAt: new Date(),
  endedAt: null,
  endReason: null,
  id: 1,
  livekitRoomName: "matching:1",
  startedAt: null,
  status: "COUNTDOWN",
  user1Id: 1,
  user2Id: 2,
  ...overrides,
})

describe("getMatchingStatus", () => {
  const buildRepos = () => {
    const matchingQueueRedisRepository: MatchingQueueRedisRepository = {
      add: jest.fn(),
      findJoinedAt: jest.fn(),
      findTopWaitingUsers: jest.fn(),
      findPosition: jest.fn(),
      remove: jest.fn(),
      removeBothAtomic: jest.fn(),
    }
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markEnded: jest.fn(),
    }
    return { matchingQueueRedisRepository, matchingSessionRepository }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("アクティブセッションあり → MATCHED", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock).mockResolvedValue(
      buildSession(),
    )

    const result = await getMatchingStatus(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ position: null, status: "MATCHED", waitedSeconds: null })
    }
    /** Redis 確認は不要なのでスキップしている */
    expect(repo.matchingQueueRedisRepository.findPosition).not.toHaveBeenCalled()
  })

  it("セッションなし & Redis に存在 → WAITING（position と waited_seconds を返す）", async () => {
    const repo = buildRepos()
    const fixedNow = 1_700_000_000_000
    jest.spyOn(Date, "now").mockReturnValue(fixedNow)
    ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null)
    ;(repo.matchingQueueRedisRepository.findPosition as jest.Mock).mockResolvedValue(0)
    ;(repo.matchingQueueRedisRepository.findJoinedAt as jest.Mock).mockResolvedValue(
      fixedNow - 3500,
    )

    const result = await getMatchingStatus(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ position: 0, status: "WAITING", waitedSeconds: 3 })
    }

    jest.restoreAllMocks()
  })

  it("セッション・Redis 両方なし → NONE", async () => {
    const repo = buildRepos()
    ;(repo.matchingSessionRepository.findActiveByUserId as jest.Mock).mockResolvedValue(null)
    ;(repo.matchingQueueRedisRepository.findPosition as jest.Mock).mockResolvedValue(null)
    ;(repo.matchingQueueRedisRepository.findJoinedAt as jest.Mock).mockResolvedValue(null)

    const result = await getMatchingStatus(1, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({ position: null, status: "NONE", waitedSeconds: null })
    }
  })
})
