import { type IGoogleOAuthClient, GoogleUserInfo } from "../../../src/client/google-oauth"
import { UserRegistrationRepository } from "../../../src/repository/prisma/aggregate/user-registration-repository"
import { AuthAccountRepository } from "../../../src/repository/prisma/auth-account-repository"
import { authenticateWithGoogle } from "../../../src/service/auth-service"
import { AuthAccountWithUser, User } from "../../../src/types/domain"

// モック
const mockGetUserInfo = jest.fn<Promise<GoogleUserInfo>, [string]>()
const mockFindByProvider = jest.fn<Promise<AuthAccountWithUser | null>, [string, string]>()
const mockCreateUserWithAuthAccountTx = jest.fn<Promise<User>, [Parameters<UserRegistrationRepository["createUserWithAuthAccountTx"]>[0]]>()

const mockGoogleAuthClient: IGoogleOAuthClient = {
  generateAuthUrl: jest.fn(),
  getUserInfo: mockGetUserInfo,
}

const mockRepository: {
  authAccountRepository: AuthAccountRepository
  userRegistrationRepository: UserRegistrationRepository
} = {
  authAccountRepository: {
    create: jest.fn(),
    findByProvider: mockFindByProvider,
  },
  userRegistrationRepository: {
    createUserWithAuthAccountTx: mockCreateUserWithAuthAccountTx,
  },
}

const mockTokenGenerator = jest.fn<string, [number]>(
  (userId: number) => `mock-jwt-token-${userId}`
)

describe("authenticateWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("既存ユーザーの場合、ok: true とユーザー情報・JWTトークンを返す", async () => {
    // Arrange
    const mockGoogleUser: GoogleUserInfo = {
      email: "test@example.com",
      id: "google-123",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    }

    const mockExistingUser: User = {
      avatarUrl: "https://example.com/avatar.jpg",
      createdAt: new Date(),
      email: "test@example.com",
      id: 1,
      name: "Test User",
      updatedAt: new Date(),
    }

    const mockExistingAccount: AuthAccountWithUser = {
      accessToken: null,
      createdAt: new Date(),
      expiresAt: null,
      id: 1,
      idToken: null,
      provider: "google",
      providerAccountId: "google-123",
      refreshToken: null,
      scope: null,
      tokenType: null,
      updatedAt: new Date(),
      user: mockExistingUser,
      userId: 1,
    }

    mockGetUserInfo.mockResolvedValue(mockGoogleUser)
    mockFindByProvider.mockResolvedValue(mockExistingAccount)

    // Act
    const result = await authenticateWithGoogle(
      "auth-code",
      mockRepository,
      mockGoogleAuthClient,
      mockTokenGenerator
    )

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isNewUser).toBe(false)
      expect(result.value.user).toEqual(mockExistingUser)
      expect(result.value.jwtToken).toBe("mock-jwt-token-1")
    }
    expect(mockGetUserInfo).toHaveBeenCalledWith("auth-code")
    expect(mockFindByProvider).toHaveBeenCalledWith("google", "google-123")
    expect(mockCreateUserWithAuthAccountTx).not.toHaveBeenCalled()
  })

  it("新規ユーザーの場合、ok: true でユーザーを作成してJWTトークンを返す", async () => {
    // Arrange
    const mockGoogleUser: GoogleUserInfo = {
      email: "newuser@example.com",
      id: "google-456",
      name: "New User",
      picture: "https://example.com/new-avatar.jpg",
    }

    const mockNewUser: User = {
      avatarUrl: "https://example.com/new-avatar.jpg",
      createdAt: new Date(),
      email: "newuser@example.com",
      id: 2,
      name: "New User",
      updatedAt: new Date(),
    }

    mockGetUserInfo.mockResolvedValue(mockGoogleUser)
    mockFindByProvider.mockResolvedValue(null)
    mockCreateUserWithAuthAccountTx.mockResolvedValue(mockNewUser)

    // Act
    const result = await authenticateWithGoogle(
      "auth-code",
      mockRepository,
      mockGoogleAuthClient,
      mockTokenGenerator
    )

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isNewUser).toBe(true)
      expect(result.value.user).toEqual(mockNewUser)
      expect(result.value.jwtToken).toBe("mock-jwt-token-2")
    }
    expect(mockGetUserInfo).toHaveBeenCalledWith("auth-code")
    expect(mockFindByProvider).toHaveBeenCalledWith("google", "google-456")
    expect(mockCreateUserWithAuthAccountTx).toHaveBeenCalledWith({
      authAccount: {
        provider: "google",
        providerAccountId: "google-456",
      },
      user: {
        avatarUrl: "https://example.com/new-avatar.jpg",
        email: "newuser@example.com",
        name: "New User",
      },
    })
  })

  it("Google認証エラー時にエラーをスローする", async () => {
    // Arrange
    const mockError = new Error("Google authentication failed")
    mockGetUserInfo.mockRejectedValue(mockError)

    // Act & Assert
    await expect(
      authenticateWithGoogle(
        "invalid-code",
        mockRepository,
        mockGoogleAuthClient,
        mockTokenGenerator
      )
    ).rejects.toThrow("Google authentication failed")
  })
})
