import {
  BlockMutationRepository,
  FollowBidirectionalRepository,
  TransactionRunner,
  UserRepository,
} from "../../../src/repository/prisma"
import { blockUser } from "../../../src/service/block-service"

const buildRepos = () => {
  const blockMutationRepository: BlockMutationRepository = {
    create: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn().mockResolvedValue(false),
  }
  const followBidirectionalRepository: FollowBidirectionalRepository = {
    deleteBidirectional: jest.fn(),
  }
  const transactionRunner: TransactionRunner = {
    /**
     * tx は使わない（mock 内で repository 呼び出しを直接 verify する）ため undefined を渡す。
     */
    run: jest.fn().mockImplementation(async (fn) => fn(undefined)),
  }
  const userRepository: Partial<UserRepository> = {
    findById: jest.fn().mockResolvedValue({ id: 2 }),
  }
  return {
    blockMutationRepository,
    followBidirectionalRepository,
    transactionRunner,
    userRepository: userRepository as UserRepository,
  }
}

describe("blockUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【異常系】自分自身 → 400 / create 呼び出しなし", async () => {
    const repo = buildRepos()
    const result = await blockUser({ blockedId: 1, blockerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.blockMutationRepository.create).not.toHaveBeenCalled()
    expect(repo.followBidirectionalRepository.deleteBidirectional).not.toHaveBeenCalled()
  })

  it("【異常系】対象が存在しない → 404", async () => {
    const repo = buildRepos()
    ;(repo.userRepository.findById as jest.Mock).mockResolvedValue(null)
    const result = await blockUser({ blockedId: 999, blockerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
    expect(repo.blockMutationRepository.create).not.toHaveBeenCalled()
  })

  it("【異常系】既にブロック済 → 409 / create 呼び出しなし", async () => {
    const repo = buildRepos()
    ;(repo.blockMutationRepository.exists as jest.Mock).mockResolvedValue(true)
    const result = await blockUser({ blockedId: 2, blockerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(409)
      expect(result.error.type).toBe("CONFLICT")
    }
    expect(repo.blockMutationRepository.create).not.toHaveBeenCalled()
    expect(repo.followBidirectionalRepository.deleteBidirectional).not.toHaveBeenCalled()
  })

  it("【正常系】ok / block.create と follow.deleteBidirectional が同一 tx で 1 回ずつ呼ばれる", async () => {
    const repo = buildRepos()
    const result = await blockUser({ blockedId: 2, blockerId: 1 }, repo)
    expect(result.ok).toBe(true)
    expect(repo.transactionRunner.run).toHaveBeenCalledTimes(1)
    expect(repo.blockMutationRepository.create).toHaveBeenCalledTimes(1)
    expect(repo.blockMutationRepository.create).toHaveBeenCalledWith(
      { blockedId: 2, blockerId: 1 },
      undefined,
    )
    expect(repo.followBidirectionalRepository.deleteBidirectional).toHaveBeenCalledTimes(1)
    expect(repo.followBidirectionalRepository.deleteBidirectional).toHaveBeenCalledWith(
      { userIdA: 1, userIdB: 2 },
      undefined,
    )
  })

  it("【異常系】create 中のレースで P2002 → 409 に変換", async () => {
    const repo = buildRepos()
    ;(repo.blockMutationRepository.create as jest.Mock).mockRejectedValue({ code: "P2002" })
    const result = await blockUser({ blockedId: 2, blockerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(409)
      expect(result.error.type).toBe("CONFLICT")
    }
  })

  it("【異常系】create 中の想定外エラーは throw する", async () => {
    const repo = buildRepos()
    ;(repo.blockMutationRepository.create as jest.Mock).mockRejectedValue(new Error("db down"))
    await expect(blockUser({ blockedId: 2, blockerId: 1 }, repo)).rejects.toThrow()
  })
})
