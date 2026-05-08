import { UserProfileWithHobbies , UserRepository } from "../../../src/repository/prisma/user-repository"
import { getUserProfile } from "../../../src/service/user-service"
import { Hobby, User } from "../../../src/types/domain"

const mockFindProfileById = jest.fn<Promise<UserProfileWithHobbies | null>, [number]>()

const mockUserRepository: UserRepository = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findProfileById: mockFindProfileById,
  update: jest.fn(),
}

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

const baseHobbies: Hobby[] = [
  { id: 1, name: "音楽鑑賞", sortOrder: 1 },
  { id: 5, name: "ゲーム", sortOrder: 5 },
]

describe("getUserProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("自分のプロフィール取得時 isSelf=true で全情報（birthDate / coinBalance / hobbies / mbti / location）を返す", async () => {
    mockFindProfileById.mockResolvedValue({ hobbies: baseHobbies, user: baseUser })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: baseUser.birthDate,
        coinBalance: 100,
        gender: "MALE",
        hobbies: baseHobbies,
        id: 1,
        isSelf: true,
        location: "Tokyo",
        mbti: "INTJ",
        name: "Alice",
      })
    }
  })

  it("他人のプロフィール取得時 isSelf=false で birthDate / coinBalance のみ null マスク。mbti / location / hobbies は公開", async () => {
    mockFindProfileById.mockResolvedValue({ hobbies: baseHobbies, user: baseUser })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 99 },
      { userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: null,
        coinBalance: null,
        gender: "MALE",
        hobbies: baseHobbies,
        isSelf: false,
        location: "Tokyo",
        mbti: "INTJ",
      })
    }
  })

  it("ユーザーが存在しない場合、404 NOT_FOUND を返す", async () => {
    mockFindProfileById.mockResolvedValue(null)

    const result = await getUserProfile(
      { targetUserId: 999, viewerUserId: 1 },
      { userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({
        statusCode: 404,
        type: "NOT_FOUND",
      })
    }
  })

  it("birthDate が null の場合、age=null", async () => {
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: { ...baseUser, birthDate: null },
    })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.age).toBeNull()
    }
  })

  it("mbti / location が null の場合、レスポンスでも null", async () => {
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: { ...baseUser, location: null, mbti: null },
    })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository }
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        location: null,
        mbti: null,
      })
    }
  })

  it("DB エラー時は throw する（業務エラーではないため）", async () => {
    mockFindProfileById.mockRejectedValue(new Error("Database connection failed"))

    await expect(
      getUserProfile({ targetUserId: 1, viewerUserId: 1 }, { userRepository: mockUserRepository })
    ).rejects.toThrow()
  })
})
