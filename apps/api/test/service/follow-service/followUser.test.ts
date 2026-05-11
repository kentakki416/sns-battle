import {
  BlockRepository,
  FollowRepository,
  UserRepository,
} from "../../../src/repository/prisma"
import { followUser } from "../../../src/service/follow-service"

const buildRepos = () => {
  const blockRepository: BlockRepository = {
    existsBetween: jest.fn().mockResolvedValue(false),
    findBlockedUserIds: jest.fn(),
  }
  const followRepository: FollowRepository = {
    create: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
  }
  const userRepository: Partial<UserRepository> = {
    findById: jest.fn().mockResolvedValue({ id: 2 }),
  }
  return {
    blockRepository,
    followRepository,
    userRepository: userRepository as UserRepository,
  }
}

describe("followUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【異常系】自分自身 → 400 / create 呼び出しなし", async () => {
    const repo = buildRepos()
    const result = await followUser({ followeeId: 1, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.followRepository.create).not.toHaveBeenCalled()
  })

  it("【異常系】フォロー対象が存在しない → 404", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)
    const result = await followUser({ followeeId: 999, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
  })

  it("【異常系】ブロック関係あり → 400", async () => {
    const repo = buildRepos()
    ;(repo.blockRepository.existsBetween as jest.Mock).mockResolvedValue(true)
    const result = await followUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.followRepository.create).not.toHaveBeenCalled()
  })

  it("【異常系】既にフォロー済 → 409", async () => {
    const repo = buildRepos()
    ;(repo.followRepository.exists as jest.Mock).mockResolvedValue(true)
    const result = await followUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(409)
      expect(result.error.type).toBe("CONFLICT")
    }
    expect(repo.followRepository.create).not.toHaveBeenCalled()
  })

  it("【正常系】正常系 → ok / create が 1 回呼ばれる", async () => {
    const repo = buildRepos()
    const result = await followUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(true)
    expect(repo.followRepository.create).toHaveBeenCalledTimes(1)
    expect(repo.followRepository.create).toHaveBeenCalledWith({ followeeId: 2, followerId: 1 })
  })

  it("【異常系】create 中のレースで P2002 → 409 に変換", async () => {
    const repo = buildRepos()
    ;(repo.followRepository.create as jest.Mock).mockRejectedValue({ code: "P2002" })
    const result = await followUser({ followeeId: 2, followerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(409)
      expect(result.error.type).toBe("CONFLICT")
    }
  })

  it("【異常系】create 中の想定外エラーは throw する", async () => {
    const repo = buildRepos()
    ;(repo.followRepository.create as jest.Mock).mockRejectedValue(new Error("db down"))
    await expect(followUser({ followeeId: 2, followerId: 1 }, repo)).rejects.toThrow()
  })
})
