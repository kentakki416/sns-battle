import request from "supertest"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userGetController = new UserGetController(userRepository)

const app = createTestApp()
app.use("/api/users", userRouter({ get: userGetController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/users/:id", () => {
  it("【正常系】自分の id を取得すると is_self=true で全情報 + 趣味配列が返る", async () => {
    const hobby1 = await testPrisma.hobbyMaster.create({
      data: { name: "音楽鑑賞", sortOrder: 1 },
    })
    const hobby2 = await testPrisma.hobbyMaster.create({
      data: { name: "ゲーム", sortOrder: 5 },
    })
    const me = await testPrisma.user.create({
      data: {
        birthDate: new Date("1995-05-15"),
        coinBalance: 100,
        email: "me@example.com",
        gender: "MALE",
        hobbies: {
          create: [{ hobbyId: hobby1.id }, { hobbyId: hobby2.id }],
        },
        isOnboarded: true,
        location: "Tokyo",
        mbti: "INTJ",
        name: "Me",
      },
    })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: null,
      birth_date: "1995-05-15",
      coin_balance: 100,
      created_at: expect.any(String),
      gender: "MALE",
      hobbies: [
        { id: hobby1.id, name: "音楽鑑賞" },
        { id: hobby2.id, name: "ゲーム" },
      ],
      id: me.id,
      is_onboarded: true,
      is_self: true,
      location: "Tokyo",
      mbti: "INTJ",
      name: "Me",
    })
  })

  it("【正常系】他人の id を取得すると is_self=false で birth_date / coin_balance のみ null マスク。趣味 / mbti / location は公開", async () => {
    const hobby = await testPrisma.hobbyMaster.create({
      data: { name: "ヨガ", sortOrder: 12 },
    })
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const other = await testPrisma.user.create({
      data: {
        birthDate: new Date("1990-01-01"),
        coinBalance: 9999,
        email: "other@example.com",
        gender: "FEMALE",
        hobbies: { create: [{ hobbyId: hobby.id }] },
        isOnboarded: true,
        location: "Osaka",
        mbti: "ENFP",
        name: "Other",
      },
    })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/users/${other.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: null,
      birth_date: null,
      coin_balance: null,
      created_at: expect.any(String),
      gender: "FEMALE",
      hobbies: [{ id: hobby.id, name: "ヨガ" }],
      id: other.id,
      is_onboarded: true,
      is_self: false,
      location: "Osaka",
      mbti: "ENFP",
      name: "Other",
    })
  })

  it("【異常系】存在しない id の場合 404 を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/users/9999999")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("【異常系】不正な id（数値変換不可）の場合 400 を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/users/abc")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】認証なしの場合 401 を返す", async () => {
    const res = await request(app).get("/api/users/1")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
