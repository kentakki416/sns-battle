import {
  BlockRepository,
  FollowListRepository,
  RecommendedUser,
  UserRecommendationRepository,
} from "../../../src/repository/prisma"
import { getRecommendedUsers } from "../../../src/service/user-service"

const buildEntry = (overrides: Partial<RecommendedUser> & { id: number }): RecommendedUser => ({
  avatarUrl: null,
  bio: null,
  followerCount: 0,
  name: "User",
  ...overrides,
})

const buildRepos = () => {
  const blockRepository: BlockRepository = {
    existsBetween: jest.fn(),
    findBlockedUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  }
  const followListRepository: FollowListRepository = {
    findFollowers: jest.fn().mockResolvedValue([]),
    findFollowing: jest.fn().mockResolvedValue([]),
    findFollowingUserIds: jest.fn().mockResolvedValue(new Set<number>()),
  }
  const userRecommendationRepository: UserRecommendationRepository = {
    findRecommendations: jest.fn().mockResolvedValue([]),
  }
  return { blockRepository, followListRepository, userRecommendationRepository }
}

describe("getRecommendedUsers", () => {
  beforeEach(() => jest.clearAllMocks())

  it("【正常系】excludeIds に「自分 + フォロー中 + ブロック関係」をマージして渡す", async () => {
    const repo = buildRepos()
    ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set([10, 20]))
    ;(repo.followListRepository.findFollowingUserIds as jest.Mock).mockResolvedValue(
      new Set([30, 40]),
    )

    await getRecommendedUsers({ currentUserId: 1, limit: 12 }, repo)

    expect(repo.userRecommendationRepository.findRecommendations).toHaveBeenCalledTimes(1)
    const callArg = (repo.userRecommendationRepository.findRecommendations as jest.Mock).mock
      .calls[0][0]
    expect(callArg.limit).toBe(12)
    /** 自分 1, ブロック 10/20, フォロー 30/40 が含まれる（順序不問） */
    expect([...callArg.excludeIds].sort((a: number, b: number) => a - b)).toEqual([1, 10, 20, 30, 40])
  })

  it("【正常系】ブロック・フォローが重複した場合も dedupe されて渡される", async () => {
    const repo = buildRepos()
    ;(repo.blockRepository.findBlockedUserIds as jest.Mock).mockResolvedValue(new Set([10, 20]))
    ;(repo.followListRepository.findFollowingUserIds as jest.Mock).mockResolvedValue(
      new Set([10, 30]),
    )

    await getRecommendedUsers({ currentUserId: 1, limit: 5 }, repo)

    const callArg = (repo.userRecommendationRepository.findRecommendations as jest.Mock).mock
      .calls[0][0]
    expect([...callArg.excludeIds].sort((a: number, b: number) => a - b)).toEqual([1, 10, 20, 30])
  })

  it("【正常系】Repository が返した entries をそのまま透過する", async () => {
    const repo = buildRepos()
    ;(repo.userRecommendationRepository.findRecommendations as jest.Mock).mockResolvedValue([
      buildEntry({ followerCount: 10, id: 5, name: "Top" }),
      buildEntry({ followerCount: 3, id: 7, name: "Sec" }),
    ])

    const result = await getRecommendedUsers({ currentUserId: 1, limit: 12 }, repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.entries).toEqual([
        buildEntry({ followerCount: 10, id: 5, name: "Top" }),
        buildEntry({ followerCount: 3, id: 7, name: "Sec" }),
      ])
    }
  })

  it("【正常系】ヒット 0 件 → 空配列を ok で返す", async () => {
    const repo = buildRepos()
    const result = await getRecommendedUsers({ currentUserId: 1, limit: 12 }, repo)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.entries).toEqual([])
  })
})
