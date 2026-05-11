import {
  FollowListEntry,
  FollowListRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { getFollowing } from "../../../src/service/follow-service"

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
  }
  const userRepository: Partial<UserRepository> = {
    findById: jest.fn().mockResolvedValue({ id: 1 }),
  }
  return {
    followListRepository,
    userRepository: userRepository as UserRepository,
  }
}

describe("getFollowing", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【異常系】対象ユーザーが存在しない → 404 / findFollowing 呼ばれない", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)
    const result = await getFollowing(
      { cursor: undefined, limit: 20, targetUserId: 999 },
      repo,
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
    expect(repo.followListRepository.findFollowing).not.toHaveBeenCalled()
  })

  it("【正常系】entries が limit 未満 → nextCursor null", async () => {
    const repo = buildRepos()
    ;(repo.followListRepository.findFollowing as jest.Mock).mockResolvedValue([
      buildEntry({ followId: 50, id: 2 }),
    ])
    const result = await getFollowing(
      { cursor: undefined, limit: 20, targetUserId: 1 },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBeNull()
    }
  })

  it("【正常系】entries が limit ぴったり → nextCursor は末尾 followId", async () => {
    const repo = buildRepos()
    ;(repo.followListRepository.findFollowing as jest.Mock).mockResolvedValue([
      buildEntry({ followId: 80, id: 2 }),
      buildEntry({ followId: 70, id: 3 }),
    ])
    const result = await getFollowing(
      { cursor: undefined, limit: 2, targetUserId: 1 },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBe(70)
    }
  })

  it("【正常系】cursor を repository に伝搬する", async () => {
    const repo = buildRepos()
    await getFollowing(
      { cursor: 200, limit: 5, targetUserId: 1 },
      repo,
    )
    expect(repo.followListRepository.findFollowing).toHaveBeenCalledWith(1, {
      cursor: 200,
      limit: 5,
    })
  })
})
