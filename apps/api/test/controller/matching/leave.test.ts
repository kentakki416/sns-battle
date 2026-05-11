import request from "supertest"

import { MatchingLeaveController } from "../../../src/controller/matching/leave"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingQueueRepository } from "../../../src/repository/prisma/matching-queue-repository"
import { IoRedisMatchingQueueRepository } from "../../../src/repository/redis/matching-queue-repository"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
} from "../setup"

const matchingQueueRepository = new PrismaMatchingQueueRepository(testPrisma)
const matchingQueueRedisRepository = new IoRedisMatchingQueueRepository(testRedis)
const matchingLeaveController = new MatchingLeaveController(
  matchingQueueRedisRepository,
  matchingQueueRepository,
)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ leave: matchingLeaveController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("DELETE /api/matching/leave", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).delete("/api/matching/leave")
    expect(res.status).toBe(401)
  })

  it("【正常系】待機中のユーザーが leave → Redis と DB の両方から削除される", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    await testRedis.zadd("matching:queue", Date.now(), String(me.id))
    await testPrisma.matchingQueue.create({ data: { status: "WAITING", userId: me.id } })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .delete("/api/matching/leave")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ message: expect.any(String) })
    expect(await testRedis.zscore("matching:queue", String(me.id))).toBeNull()
    expect(await testPrisma.matchingQueue.findUnique({ where: { userId: me.id } })).toBeNull()
  })

  it("【正常系】元々参加していなくても 200（冪等）", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .delete("/api/matching/leave")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
  })
})
