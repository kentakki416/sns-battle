import { GoogleUserInfo, IGoogleOAuthClient } from "../../../src/client/google-oauth"
import { UserRegistrationRepository } from "../../../src/repository/prisma/aggregate/user-registration-repository"
import { AuthAccountRepository } from "../../../src/repository/prisma/auth-account-repository"
import { RefreshTokenRepository } from "../../../src/repository/redis/refresh-token-repository"
import { authenticateWithGoogle } from "../../../src/service/auth-service"
import { AuthAccountWithUser, User } from "../../../src/types/domain"

const mockGetUserInfo = jest.fn<Promise<GoogleUserInfo>, [string, string]>()
const mockGoogleOAuthClient: IGoogleOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

const mockFindByProvider = jest.fn<Promise<AuthAccountWithUser | null>, [string, string]>()
const mockAuthAccountRepository: AuthAccountRepository = {
  create: jest.fn(),
  findByProvider: mockFindByProvider,
}

const mockCreateUserWithAuthAccountTx = jest.fn<Promise<User>, [Parameters<UserRegistrationRepository["createUserWithAuthAccountTx"]>[0]]>()
const mockUserRegistrationRepository: UserRegistrationRepository = {
  createUserWithAuthAccountTx: mockCreateUserWithAuthAccountTx,
}

const mockRefreshTokenSave = jest.fn<Promise<void>, [string, number, number]>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: jest.fn(),
  findUserId: jest.fn(),
  save: mockRefreshTokenSave,
}

const mockRepository = {
  authAccountRepository: mockAuthAccountRepository,
  refreshTokenRepository: mockRefreshTokenRepository,
  userRegistrationRepository: mockUserRegistrationRepository,
}

const mockTokenGenerators = {
  generateAccessToken: jest.fn((_userId: number) => "access.jwt"),
  generateRefreshToken: jest.fn((_userId: number) => ({ jti: "uuid-1", token: "refresh.jwt" })),
}

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/google"

describe("authenticateWithGoogle", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("既存ユーザーの場合、isNewUser=false で Access/Refresh Token を発行する", async () => {
    const mockGoogleUser: GoogleUserInfo = {
      email: "test@example.com",
      id: "google-123",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    }

    const mockExistingUser: User = {
      avatarUrl: "https://example.com/avatar.jpg",
      bio: null,
      createdAt: new Date(),
      email: "test@example.com",
      id: 1,
      isOnboarded: false,
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

    const result = await authenticateWithGoogle(
      { code: "auth-code", redirectUri: REDIRECT_URI },
      mockRepository,
      mockGoogleOAuthClient,
      mockTokenGenerators
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        accessToken: "access.jwt",
        isNewUser: false,
        refreshToken: "refresh.jwt",
        user: mockExistingUser,
      })
    }
    expect(mockGetUserInfo).toHaveBeenCalledWith("auth-code", REDIRECT_URI)
    expect(mockCreateUserWithAuthAccountTx).not.toHaveBeenCalled()
    expect(mockRefreshTokenSave).toHaveBeenCalledWith("uuid-1", 1, expect.any(Number))
  })

  it("新規ユーザーの場合、isNewUser=true でユーザーを作成し Access/Refresh Token を発行する", async () => {
    const mockGoogleUser: GoogleUserInfo = {
      email: "newuser@example.com",
      id: "google-456",
      name: "New User",
      picture: "https://example.com/new-avatar.jpg",
    }

    const mockNewUser: User = {
      avatarUrl: "https://example.com/new-avatar.jpg",
      bio: null,
      createdAt: new Date(),
      email: "newuser@example.com",
      id: 2,
      isOnboarded: false,
      name: "New User",
      updatedAt: new Date(),
    }

    mockGetUserInfo.mockResolvedValue(mockGoogleUser)
    mockFindByProvider.mockResolvedValue(null)
    mockCreateUserWithAuthAccountTx.mockResolvedValue(mockNewUser)

    const result = await authenticateWithGoogle(
      { code: "auth-code", redirectUri: REDIRECT_URI },
      mockRepository,
      mockGoogleOAuthClient,
      mockTokenGenerators
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        accessToken: "access.jwt",
        isNewUser: true,
        refreshToken: "refresh.jwt",
        user: mockNewUser,
      })
    }
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
    expect(mockRefreshTokenSave).toHaveBeenCalledWith("uuid-1", 2, expect.any(Number))
  })

  it("Google 認証エラー時に例外が伝播する", async () => {
    mockGetUserInfo.mockRejectedValue(new Error("network"))

    await expect(
      authenticateWithGoogle(
        { code: "invalid", redirectUri: REDIRECT_URI },
        mockRepository,
        mockGoogleOAuthClient,
        mockTokenGenerators
      )
    ).rejects.toThrow()
  })
})
