import request from "supertest"

import { AuthRefreshController } from "../../../src/controller/auth/refresh"
import { generateRefreshToken } from "../../../src/lib/jwt"
import { RefreshTokenRepository } from "../../../src/repository/redis/refresh-token-repository"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp } from "../helper"

const mockFindUserId = jest.fn<Promise<number | null>, [string]>()
const mockDelete = jest.fn<Promise<void>, [string]>()
const mockSave = jest.fn<Promise<void>, [string, number, number]>()
const mockRefreshTokenRepository: RefreshTokenRepository = {
  delete: mockDelete,
  findUserId: mockFindUserId,
  save: mockSave,
}

const app = createTestApp()

const authRefreshController = new AuthRefreshController(mockRefreshTokenRepository)

app.use("/api/auth", authRouter({ refresh: authRefreshController }))
attachErrorHandler(app)

beforeEach(() => {
  jest.clearAllMocks()
})

describe("POST /api/auth/refresh", () => {
  it("正常系: 200 と新しい Access/Refresh Token を返す", async () => {
    const userId = 1
    const { jti, token } = generateRefreshToken(userId)
    mockFindUserId.mockResolvedValue(userId)

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: token })

    expect(res.status).toBe(200)
    expect(res.body.access_token).toBeDefined()
    expect(res.body.refresh_token).toBeDefined()
    expect(mockDelete).toHaveBeenCalledWith(jti)
    expect(mockSave).toHaveBeenCalled()
  })

  it("Refresh Token が改ざんされている場合、401 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: "invalid.refresh.token" })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("Redis に jti が無い場合（再利用検知）、401 を返す", async () => {
    const { token } = generateRefreshToken(1)
    mockFindUserId.mockResolvedValue(null)

    const res = await request(app)
      .post("/api/auth/refresh")
      .send({ refresh_token: token })

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
    expect(mockDelete).not.toHaveBeenCalled()
  })

  it("refresh_token が無い場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .send({})

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})
