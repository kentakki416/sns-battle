import request from "supertest"

import { AuthMeController } from "../../../src/controller/auth/me"
import { generateToken } from "../../../src/lib/jwt"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)

const app = createTestApp()

const authMeController = new AuthMeController(userRepository)

app.use("/api/auth", authRouter({ me: authMeController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("GET /api/auth/me", () => {
  it("認証済みユーザーの場合、200 とユーザー情報を返す", async () => {
    const user = await testPrisma.user.create({
      data: {
        avatarUrl: "https://example.com/avatar.jpg",
        email: "test@example.com",
        name: "Test User",
      },
    })

    const token = generateToken(user.id)

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.id).toBe(user.id)
    expect(res.body.email).toBe("test@example.com")
    expect(res.body.name).toBe("Test User")
  })

  it("ユーザーが存在しない場合、404 を返す", async () => {
    const token = generateToken(999999)

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body.error).toBeDefined()
  })

  it("トークンがない場合、401 を返す", async () => {
    const res = await request(app).get("/api/auth/me")

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })

  it("無効なトークンの場合、401 を返す", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "Bearer invalid-token")

    expect(res.status).toBe(401)
    expect(res.body.error).toBeDefined()
  })
})
