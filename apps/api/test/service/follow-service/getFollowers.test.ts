import {
  FollowListEntry,
  FollowListRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { getFollowers } from "../../../src/service/follow-service"

const buildEntry = (overrides: Partial<FollowListEntry> & { followId: number; id: number }): FollowListEntry => ({
  avatarUrl: null,
  bio: null,
  name: "User",
  ...overrides,
})

const buildRepos = () => {
  const followListRepository: FollowListRepository = {
    findFollowers: jest.fn().mockResolvedValue([]),
    findFollowing: jest.fn().mockResolvedValue([]),
    findFollowingUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  }
  const userRepository: Partial<UserRepository> = {
    findById: jest.fn().mockResolvedValue({ id: 1 }),
  }
  return {
    followListRepository,
    userRepository: userRepository as UserRepository,
  }
}

describe("getFollowers", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【異常系】対象ユーザーが存在しない → 404 / findFollowers 呼ばれない", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)
    const result = await getFollowers(
      { cursor: undefined, limit: 20, targetUserId: 999 },
      repo,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
    expect(repo.followListRepository.findFollowers).not.toHaveBeenCalled()
  })

  it("【正常系】entries が limit 未満 → nextCursor null", async () => {
    const repo = buildRepos()
    ;(repo.followListRepository.findFollowers as jest.Mock).mockResolvedValue([
      buildEntry({ followId: 50, id: 2 }),
      buildEntry({ followId: 40, id: 3 }),
    ])
    const result = await getFollowers(
      { cursor: undefined, limit: 20, targetUserId: 1 },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBeNull()
      expect(result.value.entries).toHaveLength(2)
    }
  })

  it("【正常系】entries が limit ぴったり → nextCursor は末尾 followId", async () => {
    const repo = buildRepos()
    ;(repo.followListRepository.findFollowers as jest.Mock).mockResolvedValue([
      buildEntry({ followId: 50, id: 2 }),
      buildEntry({ followId: 40, id: 3 }),
      buildEntry({ followId: 30, id: 4 }),
    ])
    const result = await getFollowers(
      { cursor: undefined, limit: 3, targetUserId: 1 },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBe(30)
    }
  })

  it("【正常系】cursor を repository に伝搬する", async () => {
    const repo = buildRepos()
    await getFollowers(
      { cursor: 100, limit: 10, targetUserId: 1 },
      repo,
    )
    expect(repo.followListRepository.findFollowers).toHaveBeenCalledWith(1, {
      cursor: 100,
      limit: 10,
    })
  })
})
