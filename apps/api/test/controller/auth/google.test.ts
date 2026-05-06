import request from "supertest"

import { GoogleUserInfo, IGoogleOAuthClient } from "../../../src/client/google-oauth"
import { AuthGoogleController } from "../../../src/controller/auth/google"
import { verifyRefreshToken } from "../../../src/lib/jwt"
import { PrismaUserRegistrationRepository } from "../../../src/repository/prisma/aggregate/user-registration-repository"
import { PrismaAuthAccountRepository } from "../../../src/repository/prisma/auth-account-repository"
import { IoRedisRefreshTokenRepository } from "../../../src/repository/redis"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

/** 外部 SaaS（Google OAuth）はモックする */
const mockGetUserInfo = jest.fn<Promise<GoogleUserInfo>, [string, string]>()
const mockGoogleOAuthClient: IGoogleOAuthClient = {
  getUserInfo: mockGetUserInfo,
}

/** 自前インフラ（Postgres / Redis）は本物を使う */
const authAccountRepository = new PrismaAuthAccountRepository(testPrisma)
const userRegistrationRepository = new PrismaUserRegistrationRepository(testPrisma)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(testRedis)

const app = createTestApp()

const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRegistrationRepository,
  refreshTokenRepository,
  mockGoogleOAuthClient,
)

app.use("/api/auth", authRouter({ google: authGoogleController }))
attachErrorHandler(app)

const REDIRECT_URI = "http://localhost:3000/api/auth/callback/google"

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  jest.clearAllMocks()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/auth/google", () => {
  it("新規ユーザーの場合、200 と Access/Refresh Token を返し、DB にユーザーが作成され Redis に Refresh Token が保存される", async () => {
    mockGetUserInfo.mockResolvedValue({
      email: "new@example.com",
      id: "google-456",
      name: "New User",
      picture: "https://example.com/new-avatar.jpg",
    })

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(200)
    expect(res.body.access_token).toBeDefined()
    expect(res.body.refresh_token).toBeDefined()
    expect(res.body.is_new_user).toBe(true)
    expect(res.body.user.email).toBe("new@example.com")

    /** Postgres に User が作成されている */
    const createdUser = await testPrisma.user.findUnique({
      where: { email: "new@example.com" },
    })
    expect(createdUser).not.toBeNull()

    /** Redis に Refresh Token が保存され、userId が紐付いている */
    const payload = verifyRefreshToken(res.body.refresh_token)
    expect(payload).not.toBeNull()
    expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(createdUser!.id)
  })

  it("既存ユーザーの場合、200 と is_new_user=false で Token を返し Redis に新しい Refresh Token が保存される", async () => {
    const user = await testPrisma.user.create({
      data: {
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      },
    })
    await testPrisma.authAccount.create({
      data: {
        provider: "google",
        providerAccountId: "google-123",
        userId: user.id,
      },
    })

    mockGetUserInfo.mockResolvedValue({
      email: "test@example.com",
      id: "google-123",
      name: "Test User",
      picture: "https://example.com/avatar.jpg",
    })

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(200)
    expect(res.body.is_new_user).toBe(false)
    expect(res.body.user.id).toBe(user.id)

    const payload = verifyRefreshToken(res.body.refresh_token)
    expect(payload).not.toBeNull()
    expect(await refreshTokenRepository.findUserId(payload!.jti)).toBe(user.id)
  })

  it("code が無い場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it("redirect_uri が URL でない場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "auth-code", redirect_uri: "not-a-url" })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })

  it("Google 認証エラー時、グローバルエラーハンドラが 500 を返す", async () => {
    mockGetUserInfo.mockRejectedValue(new Error("Google authentication failed"))

    const res = await request(app)
      .post("/api/auth/google")
      .send({ code: "invalid-code", redirect_uri: REDIRECT_URI })

    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })
})
