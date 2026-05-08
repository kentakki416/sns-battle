import request from "supertest"

import { UserOnboardingController } from "../../../src/controller/user/onboarding"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaHobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const hobbyRepository = new PrismaHobbyRepository(testPrisma)
const userOnboardingController = new UserOnboardingController(userRepository, hobbyRepository)

const app = createTestApp()
app.use("/api/users", userRouter({ onboarding: userOnboardingController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("PUT /api/users/:id/onboarding", () => {
  it("必須項目のみで成功 → 200、is_onboarded=true、user_hobbies は 0 件", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: null,
      birth_date: "1995-05-15",
      coin_balance: 0,
      created_at: expect.any(String),
      gender: "MALE",
      hobbies: [],
      id: me.id,
      is_onboarded: true,
      is_self: true,
      location: null,
      mbti: null,
      name: "Alice",
    })

    const updated = await testPrisma.user.findUnique({ where: { id: me.id } })
    expect(updated).toMatchObject({
      gender: "MALE",
      isOnboarded: true,
      name: "Alice",
    })
    const hobbies = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
    expect(hobbies).toHaveLength(0)
  })

  it("全項目指定で is_onboarded=true + hobbies が DB に保存される", async () => {
    const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
    const h2 = await testPrisma.hobbyMaster.create({ data: { name: "h2", sortOrder: 2 } })
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        bio: "hello",
        birth_date: "1995-05-15",
        gender: "MALE",
        hobby_ids: [h1.id, h2.id],
        location: "Tokyo",
        mbti: "INTJ",
        name: "Alice",
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: "hello",
      birth_date: "1995-05-15",
      coin_balance: 0,
      created_at: expect.any(String),
      gender: "MALE",
      hobbies: [
        { id: h1.id, name: "h1" },
        { id: h2.id, name: "h2" },
      ],
      id: me.id,
      is_onboarded: true,
      is_self: true,
      location: "Tokyo",
      mbti: "INTJ",
      name: "Alice",
    })

    const updated = await testPrisma.user.findUnique({ where: { id: me.id } })
    expect(updated).toMatchObject({
      bio: "hello",
      gender: "MALE",
      isOnboarded: true,
      location: "Tokyo",
      mbti: "INTJ",
      name: "Alice",
    })
    const hobbies = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
    expect(hobbies).toHaveLength(2)
  })

  it("既に完了済 → 409", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Already" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
  })

  it("他人の id → 403", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const other = await testPrisma.user.create({
      data: { email: "other@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${other.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 403 })

    const otherInDb = await testPrisma.user.findUnique({ where: { id: other.id } })
    expect(otherInDb?.isOnboarded).toBe(false)
  })

  it("birth_date フォーマット不正 → 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995/05/15", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("gender 不正値 → 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "UNKNOWN", name: "Alice" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("mbti 不正値（'AAAA'）→ 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "MALE", mbti: "AAAA", name: "Alice" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("name 31 文字 → 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "1995-05-15", gender: "MALE", name: "a".repeat(31) })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("18 歳未満 birth_date → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    /** 2026-05-08 時点で 17 歳になる日付 */
    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "2010-01-01", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("hobby_ids に未登録 id → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: null },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}/onboarding`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        birth_date: "1995-05-15",
        gender: "MALE",
        hobby_ids: [999999],
        name: "Alice",
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("認証なし → 401", async () => {
    const res = await request(app)
      .put("/api/users/1/onboarding")
      .send({ birth_date: "1995-05-15", gender: "MALE", name: "Alice" })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
