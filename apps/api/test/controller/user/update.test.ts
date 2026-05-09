import request from "supertest"

import { UserUpdateController } from "../../../src/controller/user/update"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaHobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const hobbyRepository = new PrismaHobbyRepository(testPrisma)
const userUpdateController = new UserUpdateController(userRepository, hobbyRepository)

const app = createTestApp()
app.use("/api/users", userRouter({ update: userUpdateController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/users/:id", () => {
  it("全フィールド更新（hobby_ids 含む）→ 200、レスポンス完全一致 + DB に反映", async () => {
    const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
    const h2 = await testPrisma.hobbyMaster.create({ data: { name: "h2", sortOrder: 2 } })
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({
        bio: "Hello",
        birth_date: "1995-05-15",
        gender: "MALE",
        hobby_ids: [h1.id, h2.id],
        location: "Tokyo",
        mbti: "INTJ",
        name: "Updated",
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: "Hello",
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
      name: "Updated",
    })

    const dbUser = await testPrisma.user.findUnique({ where: { id: me.id } })
    expect(dbUser).toMatchObject({
      bio: "Hello",
      gender: "MALE",
      location: "Tokyo",
      mbti: "INTJ",
      name: "Updated",
    })
    const dbHobbies = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
    expect(dbHobbies).toHaveLength(2)
  })

  it("hobby_ids を新配列で更新すると既存趣味は完全置換される", async () => {
    const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
    const h2 = await testPrisma.hobbyMaster.create({ data: { name: "h2", sortOrder: 2 } })
    const h3 = await testPrisma.hobbyMaster.create({ data: { name: "h3", sortOrder: 3 } })
    const me = await testPrisma.user.create({
      data: {
        email: "me@example.com",
        hobbies: { create: [{ hobbyId: h1.id }, { hobbyId: h2.id }] },
        isOnboarded: true,
        name: "Me",
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hobby_ids: [h3.id] })

    expect(res.status).toBe(200)
    expect(res.body.hobbies).toEqual([{ id: h3.id, name: "h3" }])

    const remaining = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
    expect(remaining).toHaveLength(1)
    expect(remaining[0]).toMatchObject({ hobbyId: h3.id, userId: me.id })
  })

  it("hobby_ids 空配列を渡すと user_hobbies は全削除される", async () => {
    const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
    const me = await testPrisma.user.create({
      data: {
        email: "me@example.com",
        hobbies: { create: [{ hobbyId: h1.id }] },
        isOnboarded: true,
        name: "Me",
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hobby_ids: [] })

    expect(res.status).toBe(200)
    expect(res.body.hobbies).toEqual([])

    const remaining = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
    expect(remaining).toHaveLength(0)
  })

  it("mbti 不正値（'AAAA'）→ 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ mbti: "AAAA" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("location 101 文字 → 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ location: "a".repeat(101) })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("hobby_ids に未登録 id → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ hobby_ids: [999999] })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("18 歳未満の birth_date → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    /** 2026-05-08 時点で 17 歳になる日付 */
    const res = await request(app)
      .put(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ birth_date: "2010-01-01" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("他人の更新 → 403", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const other = await testPrisma.user.create({
      data: { email: "other@example.com", name: "Other" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put(`/api/users/${other.id}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Hacked" })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 403 })

    const otherInDb = await testPrisma.user.findUnique({ where: { id: other.id } })
    expect(otherInDb?.name).toBe("Other")
  })

  it("認証なし → 401", async () => {
    const res = await request(app).put("/api/users/1").send({ name: "X" })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
