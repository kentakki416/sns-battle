import request from "supertest"

import { MatchingStatusController } from "../../../src/controller/matching/status"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
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

const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)
const matchingQueueRedisRepository = new IoRedisMatchingQueueRepository(testRedis)
const matchingStatusController = new MatchingStatusController(
  matchingQueueRedisRepository,
  matchingSessionRepository,
)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ status: matchingStatusController }))
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

describe("GET /api/matching/status", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).get("/api/matching/status")
    expect(res.status).toBe(401)
  })

  it("セッションなし & Redis なし → NONE", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/status")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ position: null, status: "NONE", waited_seconds: null })
  })

  it("Redis Sorted Set に存在 → WAITING + position と waited_seconds を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    /** 5 秒前に参加した想定 */
    await testRedis.zadd("matching:queue", Date.now() - 5000, String(me.id))
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/status")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      position: 0,
      status: "WAITING",
      waited_seconds: expect.any(Number),
    })
    expect(res.body.waited_seconds).toBeGreaterThanOrEqual(4)
  })

  it("アクティブセッションあり → MATCHED", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:test",
        status: "ACTIVE",
        user1Id: peer.id,
        user2Id: me.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/status")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ position: null, status: "MATCHED", waited_seconds: null })
  })
})
