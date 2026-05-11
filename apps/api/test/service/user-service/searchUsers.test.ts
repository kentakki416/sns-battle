import {
  BlockRepository,
  UserSearchRepository,
  UserSearchResult,
} from "../../../src/repository/prisma"
import { searchUsers } from "../../../src/service/user-service"

const buildEntry = (overrides: Partial<UserSearchResult> & { id: number }): UserSearchResult => ({
  avatarUrl: null,
  bio: null,
  name: "User",
  ...overrides,
})

const buildRepos = () => {
  const blockRepository: BlockRepository = {
    existsBetween: jest.fn(),
    findBlockedUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  }
  const userSearchRepository: UserSearchRepository = {
    searchByName: jest.fn().mockResolvedValue([]),
  }
  return { blockRepository, userSearchRepository }
}

describe("searchUsers", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【正常系】blockRepository が返したブロック ID 集合をそのまま excludeIds として伝搬する", async () => {
    const repo = buildRepos()
    ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set([10, 20, 30]))
    await searchUsers(
      { cursor: undefined, currentUserId: 1, limit: 20, query: "alice" },
      repo,
    )
    expect(repo.userSearchRepository.searchByName).toHaveBeenCalledTimes(1)
    const callArg = (repo.userSearchRepository.searchByName as jest.Mock).mock.calls[0][0]
    expect(callArg.cursor).toBeUndefined()
    expect(callArg.limit).toBe(20)
    expect(callArg.query).toBe("alice")
    /** Set → Array 変換した結果が渡る（順序は気にしないので sort で比較） */
    expect([...callArg.excludeIds].sort((a: number, b: number) => a - b)).toEqual([10, 20, 30])
  })

  it("【正常系】entries が limit 未満 → nextCursor null", async () => {
    const repo = buildRepos()
    ;(repo.userSearchRepository.searchByName as jest.Mock).mockResolvedValue([
      buildEntry({ id: 100 }),
      buildEntry({ id: 90 }),
    ])
    const result = await searchUsers(
      { cursor: undefined, currentUserId: 1, limit: 20, query: "a" },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBeNull()
      expect(result.value.entries).toHaveLength(2)
    }
  })

  it("【正常系】entries が limit ぴったり → nextCursor は末尾 user.id", async () => {
    const repo = buildRepos()
    ;(repo.userSearchRepository.searchByName as jest.Mock).mockResolvedValue([
      buildEntry({ id: 100 }),
      buildEntry({ id: 90 }),
      buildEntry({ id: 80 }),
    ])
    const result = await searchUsers(
      { cursor: undefined, currentUserId: 1, limit: 3, query: "a" },
      repo,
    )
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.nextCursor).toBe(80)
    }
  })

  it("【正常系】cursor を repository に伝搬する", async () => {
    const repo = buildRepos()
    await searchUsers(
      { cursor: 100, currentUserId: 1, limit: 10, query: "bob" },
      repo,
    )
    expect(repo.userSearchRepository.searchByName).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: 100, limit: 10, query: "bob" }),
    )
  })
})
