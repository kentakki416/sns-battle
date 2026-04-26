import request from "supertest"

import { IGoogleOAuthClient } from "../../../src/client/google-oauth"
import { AuthGoogleController } from "../../../src/controller/auth/google"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp } from "../helper"

// Google OAuth はモック
const mockGenerateAuthUrl = jest.fn<string, []>()

const mockGoogleOAuthClient: IGoogleOAuthClient = {
  generateAuthUrl: mockGenerateAuthUrl,
  getUserInfo: jest.fn(),
}

const app = createTestApp()

const authGoogleController = new AuthGoogleController(mockGoogleOAuthClient)

app.use("/api/auth", authRouter({ google: authGoogleController }))
attachErrorHandler(app)

describe("GET /api/auth/google", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("Google認証URLにリダイレクトする", async () => {
    mockGenerateAuthUrl.mockReturnValue("https://accounts.google.com/o/oauth2/v2/auth?test=1")

    const res = await request(app).get("/api/auth/google")

    expect(res.status).toBe(302)
    expect(res.headers.location).toBe("https://accounts.google.com/o/oauth2/v2/auth?test=1")
  })

  it("URL生成エラー時、グローバルエラーハンドラが 500 を返す", async () => {
    mockGenerateAuthUrl.mockImplementation(() => {
      throw new Error("Failed to generate URL")
    })

    const res = await request(app).get("/api/auth/google")

    expect(res.status).toBe(500)
    expect(res.body.error).toBeDefined()
  })
})
