import request from "supertest"

import { MatchingPreferenceUpdateController } from "../../../src/controller/matching-preference/update"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaHobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { PrismaMatchingPreferenceRepository } from "../../../src/repository/prisma/matching-preference-repository"
import { matchingPreferenceRouter } from "../../../src/routes/matching-preference-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const matchingPreferenceRepository = new PrismaMatchingPreferenceRepository(testPrisma)
const hobbyRepository = new PrismaHobbyRepository(testPrisma)
const matchingPreferenceUpdateController = new MatchingPreferenceUpdateController(
  matchingPreferenceRepository,
  hobbyRepository,
)

const app = createTestApp()
app.use(
  "/api/matching/preferences",
  matchingPreferenceRouter({ update: matchingPreferenceUpdateController }),
)
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/matching/preferences", () => {
  it("【正常系】初回 PUT でレコードが作成される", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const hobby = await testPrisma.hobbyMaster.create({
      data: { name: "h1", sortOrder: 1 },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: 35,
        age_min: 25,
        preferred_genders: ["FEMALE", "OTHER"],
        preferred_hobby_ids: [hobby.id],
        preferred_locations: ["Tokyo", "Osaka"],
        preferred_mbti: ["INTJ", "ENFP"],
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age_max: 35,
      age_min: 25,
      preferred_genders: ["FEMALE", "OTHER"],
      preferred_hobby_ids: [hobby.id],
      preferred_locations: ["Tokyo", "Osaka"],
      preferred_mbti: ["INTJ", "ENFP"],
    })

    const stored = await testPrisma.matchingPreference.findUnique({ where: { userId: me.id } })
    expect(stored).toMatchObject({
      ageMax: 35,
      ageMin: 25,
      preferredGenders: ["FEMALE", "OTHER"],
      preferredHobbyIds: [hobby.id],
      preferredLocations: ["Tokyo", "Osaka"],
      preferredMbti: ["INTJ", "ENFP"],
      userId: me.id,
    })
  })

  it("【正常系】2 回目 PUT で更新される（同 user_id で 1 行のみ）", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    await testPrisma.matchingPreference.create({
      data: {
        ageMax: 30,
        ageMin: 20,
        preferredGenders: ["MALE"],
        preferredHobbyIds: [],
        preferredLocations: [],
        preferredMbti: [],
        userId: me.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: 40,
        age_min: 30,
        preferred_genders: ["FEMALE"],
        preferred_hobby_ids: [],
        preferred_locations: ["Kyoto"],
        preferred_mbti: ["ENFP"],
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age_max: 40,
      age_min: 30,
      preferred_genders: ["FEMALE"],
      preferred_hobby_ids: [],
      preferred_locations: ["Kyoto"],
      preferred_mbti: ["ENFP"],
    })

    const all = await testPrisma.matchingPreference.findMany({ where: { userId: me.id } })
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({
      ageMax: 40,
      ageMin: 30,
      preferredGenders: ["FEMALE"],
      preferredLocations: ["Kyoto"],
      preferredMbti: ["ENFP"],
    })
  })

  it("【異常系】age_min > age_max → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: 25,
        age_min: 35,
        preferred_genders: [],
        preferred_hobby_ids: [],
        preferred_locations: [],
        preferred_mbti: [],
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】preferred_hobby_ids に未登録 id → 400 (Service)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: null,
        age_min: null,
        preferred_genders: [],
        preferred_hobby_ids: [999999],
        preferred_locations: [],
        preferred_mbti: [],
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】preferred_genders に 4 件 → 400 (Zod max(3))", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: null,
        age_min: null,
        preferred_genders: ["MALE", "FEMALE", "OTHER", "MALE"],
        preferred_hobby_ids: [],
        preferred_locations: [],
        preferred_mbti: [],
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】preferred_mbti に 'AAAA' → 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: null,
        age_min: null,
        preferred_genders: [],
        preferred_hobby_ids: [],
        preferred_locations: [],
        preferred_mbti: ["AAAA"],
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】age_min が 17（範囲下限割れ）→ 400 (Zod)", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: null,
        age_min: 17,
        preferred_genders: [],
        preferred_hobby_ids: [],
        preferred_locations: [],
        preferred_mbti: [],
      })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【正常系】全フィールド空配列 / null → 200、DB に作成", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .put("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)
      .send({
        age_max: null,
        age_min: null,
        preferred_genders: [],
        preferred_hobby_ids: [],
        preferred_locations: [],
        preferred_mbti: [],
      })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age_max: null,
      age_min: null,
      preferred_genders: [],
      preferred_hobby_ids: [],
      preferred_locations: [],
      preferred_mbti: [],
    })

    const stored = await testPrisma.matchingPreference.findUnique({ where: { userId: me.id } })
    expect(stored).not.toBeNull()
    expect(stored).toMatchObject({
      ageMax: null,
      ageMin: null,
      preferredGenders: [],
      preferredHobbyIds: [],
      preferredLocations: [],
      preferredMbti: [],
      userId: me.id,
    })
  })

  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).put("/api/matching/preferences").send({
      age_max: null,
      age_min: null,
      preferred_genders: [],
      preferred_hobby_ids: [],
      preferred_locations: [],
      preferred_mbti: [],
    })

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
