import { HobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import {
  MatchingPreferenceRepository,
  UpsertMatchingPreferenceInput,
} from "../../../src/repository/prisma/matching-preference-repository"
import { upsertMatchingPreference } from "../../../src/service/matching-preference-service"
import { Hobby, MatchingPreference } from "../../../src/types/domain"

const mockUpsertByUserId = jest.fn<
  Promise<MatchingPreference>,
  [number, UpsertMatchingPreferenceInput]
>()
const mockMatchingPreferenceRepository: MatchingPreferenceRepository = {
  findByUserId: jest.fn(),
  findManyByUserIds: jest.fn(),
  upsertByUserId: mockUpsertByUserId,
}

const mockFindActiveByIds = jest.fn<Promise<Hobby[]>, [number[]]>()
const mockHobbyRepository: HobbyRepository = {
  findActiveAll: jest.fn(),
  findActiveByIds: mockFindActiveByIds,
}

const baseInput = {
  ageMax: 35,
  ageMin: 25,
  preferredGenders: ["FEMALE"] as const,
  preferredHobbyIds: [] as number[],
  preferredLocations: ["Tokyo"],
  preferredMbti: ["INTJ"] as string[],
}

const buildStored = (overrides?: Partial<MatchingPreference>): MatchingPreference => ({
  ageMax: 35,
  ageMin: 25,
  id: 10,
  preferredGenders: ["FEMALE"],
  preferredHobbyIds: [],
  preferredLocations: ["Tokyo"],
  preferredMbti: ["INTJ"],
  userId: 1,
  ...overrides,
})

describe("upsertMatchingPreference", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("初回呼び出し → upsert で create、ok 返却", async () => {
    const stored = buildStored()
    mockUpsertByUserId.mockResolvedValue(stored)

    const result = await upsertMatchingPreference(
      { data: { ...baseInput, preferredGenders: [...baseInput.preferredGenders] }, userId: 1 },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual(stored)
    expect(mockUpsertByUserId).toHaveBeenCalledWith(1, {
      ...baseInput,
      preferredGenders: ["FEMALE"],
    })
  })

  it("既存ある場合 → upsert で update、ok 返却", async () => {
    const updated = buildStored({ ageMax: 40, ageMin: 30 })
    mockUpsertByUserId.mockResolvedValue(updated)

    const result = await upsertMatchingPreference(
      {
        data: { ...baseInput, ageMax: 40, ageMin: 30, preferredGenders: ["FEMALE"] },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({ ageMax: 40, ageMin: 30 })
    }
  })

  it("age_min > age_max → 400 BAD_REQUEST", async () => {
    const result = await upsertMatchingPreference(
      {
        data: { ...baseInput, ageMax: 25, ageMin: 35, preferredGenders: ["FEMALE"] },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockUpsertByUserId).not.toHaveBeenCalled()
  })

  it("age_min == age_max（境界値）→ ok", async () => {
    const stored = buildStored({ ageMax: 30, ageMin: 30 })
    mockUpsertByUserId.mockResolvedValue(stored)

    const result = await upsertMatchingPreference(
      {
        data: { ...baseInput, ageMax: 30, ageMin: 30, preferredGenders: ["FEMALE"] },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
  })

  it("片方が null → age バリデーションスキップ、ok", async () => {
    const stored = buildStored({ ageMax: null, ageMin: 25 })
    mockUpsertByUserId.mockResolvedValue(stored)

    const result = await upsertMatchingPreference(
      {
        data: { ...baseInput, ageMax: null, ageMin: 25, preferredGenders: ["FEMALE"] },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
  })

  it("preferredHobbyIds に存在しない id → 400", async () => {
    mockFindActiveByIds.mockResolvedValue([{ id: 1, name: "h1", sortOrder: 1 }])

    const result = await upsertMatchingPreference(
      {
        data: {
          ...baseInput,
          preferredGenders: ["FEMALE"],
          preferredHobbyIds: [1, 999],
        },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockUpsertByUserId).not.toHaveBeenCalled()
  })

  it("preferredHobbyIds が全て有効 → ok", async () => {
    mockFindActiveByIds.mockResolvedValue([
      { id: 1, name: "h1", sortOrder: 1 },
      { id: 2, name: "h2", sortOrder: 2 },
    ])
    const stored = buildStored({ preferredHobbyIds: [1, 2] })
    mockUpsertByUserId.mockResolvedValue(stored)

    const result = await upsertMatchingPreference(
      {
        data: { ...baseInput, preferredGenders: ["FEMALE"], preferredHobbyIds: [1, 2] },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
    expect(mockUpsertByUserId).toHaveBeenCalled()
  })

  it("すべて空配列 / null（フィルタ無効化）→ ok", async () => {
    const stored = buildStored({
      ageMax: null,
      ageMin: null,
      preferredGenders: [],
      preferredHobbyIds: [],
      preferredLocations: [],
      preferredMbti: [],
    })
    mockUpsertByUserId.mockResolvedValue(stored)

    const result = await upsertMatchingPreference(
      {
        data: {
          ageMax: null,
          ageMin: null,
          preferredGenders: [],
          preferredHobbyIds: [],
          preferredLocations: [],
          preferredMbti: [],
        },
        userId: 1,
      },
      {
        hobbyRepository: mockHobbyRepository,
        matchingPreferenceRepository: mockMatchingPreferenceRepository,
      }
    )

    expect(result.ok).toBe(true)
    /** hobby_ids が空のときは hobby チェックをスキップする */
    expect(mockFindActiveByIds).not.toHaveBeenCalled()
  })
})
