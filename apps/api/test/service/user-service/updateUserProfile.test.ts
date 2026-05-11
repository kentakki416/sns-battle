import { HobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import {
  UpdateUserInput,
  UserProfileWithHobbies,
  UserRepository,
} from "../../../src/repository/prisma/user-repository"
import { updateUserProfile } from "../../../src/service/user-service"
import { Hobby, User } from "../../../src/types/domain"

const mockFindById = jest.fn<Promise<User | null>, [number]>()
const mockFindProfileById = jest.fn<Promise<UserProfileWithHobbies | null>, [number]>()
const mockUpdate = jest.fn<Promise<void>, [number, UpdateUserInput]>()

const mockUserRepository: UserRepository = {
  completeOnboarding: jest.fn(),
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: mockFindById,
  findManyByIds: jest.fn(),
  findProfileById: mockFindProfileById,
  update: mockUpdate,
}

const mockFindActiveByIds = jest.fn<Promise<Hobby[]>, [number[]]>()
const mockHobbyRepository: HobbyRepository = {
  findActiveAll: jest.fn(),
  findActiveByIds: mockFindActiveByIds,
}

/**
 * 2026-05-08 (今日) 基準で 18 歳ちょうどの誕生日 = 2008-05-08
 */
const TODAY = new Date("2026-05-08T00:00:00Z")

const baseUser: User = {
  avatarUrl: null,
  bio: null,
  birthDate: new Date("1995-05-15"),
  coinBalance: 100,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  email: "u@example.com",
  gender: "MALE",
  id: 1,
  isOnboarded: true,
  location: "Tokyo",
  mbti: "INTJ",
  name: "Alice",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

describe("updateUserProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(TODAY)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("【正常系】自分の name / bio / mbti / location 更新 → ok: true、fresh プロフィールが返る", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockUpdate.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: {
        ...baseUser,
        bio: "new bio",
        location: "Osaka",
        mbti: "ENFP",
        name: "Updated",
      },
    })

    const result = await updateUserProfile(
      {
        data: { bio: "new bio", location: "Osaka", mbti: "ENFP", name: "Updated" },
        targetUserId: 1,
        viewerUserId: 1,
      },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        bio: "new bio",
        isSelf: true,
        location: "Osaka",
        mbti: "ENFP",
        name: "Updated",
      })
    }
    expect(mockUpdate).toHaveBeenCalledWith(1, expect.objectContaining({
      bio: "new bio",
      location: "Osaka",
      mbti: "ENFP",
      name: "Updated",
    }))
  })

  it("【正常系】hobby_ids を渡すと完全置換され、findProfileById で趣味反映が確認できる", async () => {
    const newHobbies: Hobby[] = [
      { id: 3, name: "ヨガ", sortOrder: 3 },
      { id: 4, name: "登山", sortOrder: 4 },
    ]
    mockFindById.mockResolvedValue(baseUser)
    mockFindActiveByIds.mockResolvedValue(newHobbies)
    mockUpdate.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({ hobbies: newHobbies, user: baseUser })

    const result = await updateUserProfile(
      { data: { hobbyIds: [3, 4] }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.hobbies).toEqual(newHobbies)
    }
    expect(mockUpdate).toHaveBeenCalledWith(1, expect.objectContaining({ hobbyIds: [3, 4] }))
  })

  it("【異常系】hobby_ids に存在しない id が含まれると 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockFindActiveByIds.mockResolvedValue([{ id: 3, name: "ヨガ", sortOrder: 3 }])

    const result = await updateUserProfile(
      { data: { hobbyIds: [3, 999] }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("【異常系】他人の更新は 403 FORBIDDEN", async () => {
    const result = await updateUserProfile(
      { data: { name: "Hacked" }, targetUserId: 1, viewerUserId: 99 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 403, type: "FORBIDDEN" })
    }
    expect(mockFindById).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("【異常系】存在しないユーザーは 404 NOT_FOUND", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await updateUserProfile(
      { data: { name: "X" }, targetUserId: 999, viewerUserId: 999 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("【正常系】18 歳ちょうど（境界値）→ ok", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockUpdate.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({ hobbies: [], user: baseUser })

    /** 2026-05-08 時点で 18 歳ちょうど */
    const result = await updateUserProfile(
      { data: { birthDate: new Date("2008-05-08") }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    expect(mockUpdate).toHaveBeenCalled()
  })

  it("【異常系】18 歳未満（境界値）→ 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)

    /** 2026-05-08 時点で誕生日前 17 歳 */
    const result = await updateUserProfile(
      { data: { birthDate: new Date("2008-05-09") }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("【異常系】121 歳（上限超過）→ 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)

    /** 2026-05-08 時点で誕生日後 121 歳 */
    const result = await updateUserProfile(
      { data: { birthDate: new Date("1905-01-01") }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("【正常系】birthDate 未指定 + hobby のみ更新 → 年齢チェックがスキップされ ok", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockFindActiveByIds.mockResolvedValue([{ id: 3, name: "ヨガ", sortOrder: 3 }])
    mockUpdate.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({
      hobbies: [{ id: 3, name: "ヨガ", sortOrder: 3 }],
      user: baseUser,
    })

    const result = await updateUserProfile(
      { data: { hobbyIds: [3] }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
  })
})
