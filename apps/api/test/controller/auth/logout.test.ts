import request from "supertest"

import { AuthLogoutController } from "../../../src/controller/auth/logout"
import { generateAccessToken, generateRefreshToken } from "../../../src/lib/jwt"
import { RefreshTokenRepository } from "../../../src/repository/redis/refresh-token-repository"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp } from "../helper"

const mockDelete = jest.fn<Promise<void>, [string]>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: mockDelete,
  findUserId: jest.fn(),
  save: jest.fn(),
}

const app = createTestApp()

const authLogoutController = new AuthLogoutController(mockRefreshTokenRepository)

app.use("/api/auth", authRouter({ logout: authLogoutController }))
attachErrorHandler(app)

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/auth/logout", () => {
  it("正常系: 200 を返し Refresh Token の jti を削除する", async () => {
    const userId = 1
    const accessToken = generateAccessToken(userId)
    const { jti, token: refreshToken } = generateRefreshToken(userId)

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refresh_token: refreshToken })

    expect(res.status).toBe(200)
    expect(mockDelete).toHaveBeenCalledWith(jti)
  })

  it("無効な Refresh Token でも冪等性のため 200 を返す（delete は呼ばれない）", async () => {
    const accessToken = generateAccessToken(1)

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ refresh_token: "invalid.refresh.token" })

    expect(res.status).toBe(200)
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("Access Token が無い場合、401 を返す", async () => {
    const { token: refreshToken } = generateRefreshToken(1)

    const res = await request(app)
      .post("/api/auth/logout")
      .send({ refresh_token: refreshToken })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it("refresh_token が無い場合、400 を返す", async () => {
    const accessToken = generateAccessToken(1)

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})
