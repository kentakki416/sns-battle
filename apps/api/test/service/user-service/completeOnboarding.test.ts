import { HobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import {
  CompleteOnboardingInput,
  UserProfileWithHobbies,
  UserRepository,
} from "../../../src/repository/prisma/user-repository"
import { completeOnboarding } from "../../../src/service/user-service"
import { Hobby, User } from "../../../src/types/domain"

const mockFindById = jest.fn<Promise<User | null>, [number]>()
const mockFindProfileById = jest.fn<Promise<UserProfileWithHobbies | null>, [number]>()
const mockCompleteOnboarding = jest.fn<Promise<void>, [number, CompleteOnboardingInput]>()

const mockUserRepository: UserRepository = {
  completeOnboarding: mockCompleteOnboarding,
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: mockFindById,
  findManyByIds: jest.fn(),
  findProfileById: mockFindProfileById,
  update: jest.fn(),
}

const mockFindActiveByIds = jest.fn<Promise<Hobby[]>, [number[]]>()
const mockHobbyRepository: HobbyRepository = {
  findActiveAll: jest.fn(),
  findActiveByIds: mockFindActiveByIds,
}

const TODAY = new Date("2026-05-08T00:00:00Z")

const baseUser: User = {
  avatarUrl: null,
  bio: null,
  birthDate: null,
  coinBalance: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  email: "u@example.com",
  gender: null,
  id: 1,
  isOnboarded: false,
  location: null,
  mbti: null,
  name: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
}

const requiredOnly = {
  bio: null,
  birthDate: new Date("1995-05-15"),
  gender: "MALE" as const,
  hobbyIds: [] as number[],
  location: null,
  mbti: null,
  name: "Alice",
}

describe("completeOnboarding", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    jest.setSystemTime(TODAY)
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("【正常系】必須項目のみで完了 → ok、is_onboarded=true、UserProfile が返る", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockCompleteOnboarding.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: {
        ...baseUser,
        birthDate: requiredOnly.birthDate,
        gender: "MALE",
        isOnboarded: true,
        name: "Alice",
      },
    })

    const result = await completeOnboarding(
      { data: requiredOnly, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        bio: null,
        birthDate: requiredOnly.birthDate,
        gender: "MALE",
        hobbies: [],
        isOnboarded: true,
        isSelf: true,
        location: null,
        mbti: null,
        name: "Alice",
      })
    }
    expect(mockCompleteOnboarding).toHaveBeenCalledWith(1, requiredOnly)
  })

  it("【正常系】全項目指定で完了 → hobbies が反映", async () => {
    const hobbies: Hobby[] = [
      { id: 1, name: "h1", sortOrder: 1 },
      { id: 2, name: "h2", sortOrder: 2 },
    ]
    mockFindById.mockResolvedValue(baseUser)
    mockFindActiveByIds.mockResolvedValue(hobbies)
    mockCompleteOnboarding.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({
      hobbies,
      user: {
        ...baseUser,
        birthDate: requiredOnly.birthDate,
        gender: "MALE",
        isOnboarded: true,
        location: "Tokyo",
        mbti: "INTJ",
        name: "Alice",
      },
    })

    const result = await completeOnboarding(
      {
        data: {
          ...requiredOnly,
          bio: "Hello",
          hobbyIds: [1, 2],
          location: "Tokyo",
          mbti: "INTJ",
        },
        targetUserId: 1,
        viewerUserId: 1,
      },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.hobbies).toEqual(hobbies)
      expect(result.value).toMatchObject({
        bio: null,
        isOnboarded: true,
        location: "Tokyo",
        mbti: "INTJ",
      })
    }
  })

  it("【異常系】既に is_onboarded=true → 409 CONFLICT", async () => {
    mockFindById.mockResolvedValue({ ...baseUser, isOnboarded: true })

    const result = await completeOnboarding(
      { data: requiredOnly, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 409, type: "CONFLICT" })
    }
    expect(mockCompleteOnboarding).not.toHaveBeenCalled()
  })

  it("【異常系】他人の id を指定 → 403 FORBIDDEN", async () => {
    const result = await completeOnboarding(
      { data: requiredOnly, targetUserId: 1, viewerUserId: 99 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 403, type: "FORBIDDEN" })
    }
    expect(mockFindById).not.toHaveBeenCalled()
  })

  it("【異常系】存在しないユーザー → 404 NOT_FOUND", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await completeOnboarding(
      { data: requiredOnly, targetUserId: 999, viewerUserId: 999 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
    expect(mockCompleteOnboarding).not.toHaveBeenCalled()
  })

  it("【異常系】18 歳未満（境界値）→ 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)

    /** 2026-05-08 時点で 17 歳になる日付 */
    const result = await completeOnboarding(
      {
        data: { ...requiredOnly, birthDate: new Date("2008-05-09") },
        targetUserId: 1,
        viewerUserId: 1,
      },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockCompleteOnboarding).not.toHaveBeenCalled()
  })

  it("【正常系】18 歳ちょうど（境界値）→ ok", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockCompleteOnboarding.mockResolvedValue()
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: {
        ...baseUser,
        birthDate: new Date("2008-05-08"),
        gender: "MALE",
        isOnboarded: true,
        name: "Alice",
      },
    })

    const result = await completeOnboarding(
      {
        data: { ...requiredOnly, birthDate: new Date("2008-05-08") },
        targetUserId: 1,
        viewerUserId: 1,
      },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    expect(mockCompleteOnboarding).toHaveBeenCalled()
  })

  it("【異常系】hobby_ids に存在しない id → 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockFindActiveByIds.mockResolvedValue([{ id: 1, name: "h1", sortOrder: 1 }])

    const result = await completeOnboarding(
      { data: { ...requiredOnly, hobbyIds: [1, 999] }, targetUserId: 1, viewerUserId: 1 },
      { hobbyRepository: mockHobbyRepository, userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
    expect(mockCompleteOnboarding).not.toHaveBeenCalled()
  })
})
