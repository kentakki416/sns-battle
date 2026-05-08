import { MatchingPreferenceRepository } from "../../../src/repository/prisma/matching-preference-repository"
import { getMatchingPreference } from "../../../src/service/matching-preference-service"
import { MatchingPreference } from "../../../src/types/domain"

const mockFindByUserId = jest.fn<Promise<MatchingPreference | null>, [number]>()
const mockMatchingPreferenceRepository: MatchingPreferenceRepository = {
  findByUserId: mockFindByUserId,
  upsertByUserId: jest.fn(),
}

describe("getMatchingPreference", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("レコード存在 → ok、保存値を返す", async () => {
    const stored: MatchingPreference = {
      ageMax: 35,
      ageMin: 25,
      id: 10,
      preferredGenders: ["FEMALE"],
      preferredHobbyIds: [1, 2],
      preferredLocations: ["Tokyo"],
      preferredMbti: ["INTJ"],
      userId: 1,
    }
    mockFindByUserId.mockResolvedValue(stored)

    const result = await getMatchingPreference(1, {
      matchingPreferenceRepository: mockMatchingPreferenceRepository,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(stored)
    }
    expect(mockFindByUserId).toHaveBeenCalledWith(1)
  })

  it("レコード未作成 → ok、デフォルト値（全配列空、age_min/max=null）を返す", async () => {
    mockFindByUserId.mockResolvedValue(null)

    const result = await getMatchingPreference(1, {
      matchingPreferenceRepository: mockMatchingPreferenceRepository,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        ageMax: null,
        ageMin: null,
        id: 0,
        preferredGenders: [],
        preferredHobbyIds: [],
        preferredLocations: [],
        preferredMbti: [],
        userId: 1,
      })
    }
  })

  it("DB エラー時は throw（業務エラーではない）", async () => {
    mockFindByUserId.mockRejectedValue(new Error("DB error"))

    await expect(
      getMatchingPreference(1, {
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      })
    ).rejects.toThrow()
  })
})
