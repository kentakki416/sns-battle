import request from "supertest"

import { MatchingPreferenceGetController } from "../../../src/controller/matching-preference/get"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingPreferenceRepository } from "../../../src/repository/prisma/matching-preference-repository"
import { matchingPreferenceRouter } from "../../../src/routes/matching-preference-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const matchingPreferenceRepository = new PrismaMatchingPreferenceRepository(testPrisma)
const matchingPreferenceGetController = new MatchingPreferenceGetController(
  matchingPreferenceRepository,
)

const app = createTestApp()
app.use(
  "/api/matching/preferences",
  matchingPreferenceRouter({ get: matchingPreferenceGetController }),
)
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("GET /api/matching/preferences", () => {
  it("レコード未作成のユーザー → 200、デフォルト値（空配列 + null）を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age_max: null,
      age_min: null,
      preferred_genders: [],
      preferred_hobby_ids: [],
      preferred_locations: [],
      preferred_mbti: [],
    })
  })

  it("レコード作成済 → 200、保存値を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    await testPrisma.matchingPreference.create({
      data: {
        ageMax: 35,
        ageMin: 25,
        preferredGenders: ["FEMALE", "OTHER"],
        preferredHobbyIds: [1, 2],
        preferredLocations: ["Tokyo"],
        preferredMbti: ["INTJ"],
        userId: me.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/preferences")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age_max: 35,
      age_min: 25,
      preferred_genders: ["FEMALE", "OTHER"],
      preferred_hobby_ids: [1, 2],
      preferred_locations: ["Tokyo"],
      preferred_mbti: ["INTJ"],
    })
  })

  it("認証なし → 401", async () => {
    const res = await request(app).get("/api/matching/preferences")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
