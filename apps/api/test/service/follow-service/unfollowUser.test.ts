import { FollowRepository } from "../../../src/repository/prisma"
import { unfollowUser } from "../../../src/service/follow-service"

const buildRepos = () => {
  const followRepository: FollowRepository = {
    create: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  }
  return { followRepository }
}

describe("unfollowUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("自分自身 → 400 / delete 呼ばれない", async () => {
    const repo = buildRepos()
    const result = await unfollowUser({ followeeId: 1, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.followRepository.delete).not.toHaveBeenCalled()
  })

  it("正常系 → ok / delete が 1 回呼ばれる", async () => {
    const repo = buildRepos()
    const result = await unfollowUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(true)
    expect(repo.followRepository.delete).toHaveBeenCalledWith({ followeeId: 2, followerId: 1 })
  })

  it("元々フォローしていなくても ok（冪等）", async () => {
    const repo = buildRepos()
    /** deleteMany は 0 件でも例外を投げない前提 */
    const result = await unfollowUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(true)
  })
})
