import { MatchingQueueRepository } from "../../../src/repository/prisma"
import { MatchingQueueRedisRepository } from "../../../src/repository/redis"
import { leaveMatching } from "../../../src/service/matching-service"

describe("leaveMatching", () => {
  const buildRepos = () => {
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
    return { matchingQueueRedisRepository, matchingQueueRepository }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("Redis と DB の両方から削除を呼ぶ", async () => {
    const repo = buildRepos()
    ;(repo.matchingQueueRedisRepository.remove as jest.Mock).mockResolvedValue(undefined)
    ;(repo.matchingQueueRepository.deleteByUserId as jest.Mock).mockResolvedValue(undefined)

    const result = await leaveMatching(1, repo)

    expect(result.ok).toBe(true)
    expect(repo.matchingQueueRedisRepository.remove).toHaveBeenCalledWith(1)
    expect(repo.matchingQueueRepository.deleteByUserId).toHaveBeenCalledWith(1)
  })

  it("元々参加していなくても 200（冪等）", async () => {
    const repo = buildRepos()
    ;(repo.matchingQueueRedisRepository.remove as jest.Mock).mockResolvedValue(undefined)
    ;(repo.matchingQueueRepository.deleteByUserId as jest.Mock).mockResolvedValue(undefined)

    const result = await leaveMatching(99, repo)

    expect(result.ok).toBe(true)
  })
})
