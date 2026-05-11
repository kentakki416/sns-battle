import { BlockMutationRepository } from "../../../src/repository/prisma"
import { unblockUser } from "../../../src/service/block-service"

const buildRepos = () => {
  const blockMutationRepository: BlockMutationRepository = {
    create: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  }
  return { blockMutationRepository }
}

describe("unblockUser", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【異常系】自分自身 → 400 / delete 呼ばれない", async () => {
    const repo = buildRepos()
    const result = await unblockUser({ blockedId: 1, blockerId: 1 }, repo)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(repo.blockMutationRepository.delete).not.toHaveBeenCalled()
  })

  it("【正常系】ok / delete が 1 回呼ばれる", async () => {
    const repo = buildRepos()
    const result = await unblockUser({ blockedId: 2, blockerId: 1 }, repo)
    expect(result.ok).toBe(true)
    expect(repo.blockMutationRepository.delete).toHaveBeenCalledWith({ blockedId: 2, blockerId: 1 })
  })

  it("【正常系】元々ブロックしていなくても ok（冪等）", async () => {
    const repo = buildRepos()
    /** deleteMany は 0 件でも例外を投げない前提 */
    const result = await unblockUser({ blockedId: 2, blockerId: 1 }, repo)
    expect(result.ok).toBe(true)
  })
})
