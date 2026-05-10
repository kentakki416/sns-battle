import request from "supertest"

import { ILiveKitClient } from "../../../src/client/livekit"
import { MatchingStampController } from "../../../src/controller/matching/stamp"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaItemRepository } from "../../../src/repository/prisma/item-repository"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { PrismaUserInventoryRepository } from "../../../src/repository/prisma/user-inventory-repository"
import { IoRedisRateLimitRepository } from "../../../src/repository/redis/rate-limit-repository"
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
const itemRepository = new PrismaItemRepository(testPrisma)
const userInventoryRepository = new PrismaUserInventoryRepository(testPrisma)
const rateLimitRedisRepository = new IoRedisRateLimitRepository(testRedis)

const livekitClient: ILiveKitClient = {
  generateRoomToken: jest.fn(),
  publishData: jest.fn().mockResolvedValue(undefined),
}

const stampController = new MatchingStampController(
  itemRepository,
  livekitClient,
  matchingSessionRepository,
  rateLimitRedisRepository,
  userInventoryRepository,
)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ stamp: stampController }))
attachErrorHandler(app)

const seedMatchingStamp = async (
  overrides?: { isPremium?: boolean; scope?: "MATCHING" | "BATTLE" },
): Promise<number> => {
  const item = await testPrisma.item.create({
    data: {
      isActive: true,
      isPremium: overrides?.isPremium ?? false,
      name: `スタンプ-${Date.now()}-${Math.random()}`,
      sortOrder: 1,
      stampDetail: { create: { animationType: "FLOAT", emoji: "🎉" } },
      type: "STAMP",
    },
  })
  await testPrisma.itemScope.create({
    data: { itemId: item.id, scope: overrides?.scope ?? "MATCHING" },
  })
  return item.id
}

const seedActiveSession = async (): Promise<{
    me: { id: number }
    peer: { id: number }
    sessionId: number
}> => {
  const me = await testPrisma.user.create({
    data: { email: `me-${Date.now()}@example.com`, isOnboarded: true, name: "Me" },
  })
  const peer = await testPrisma.user.create({
    data: { email: `peer-${Date.now()}@example.com`, isOnboarded: true, name: "Peer" },
  })
  const session = await testPrisma.matchingSession.create({
    data: {
      livekitRoomName: `matching:${Date.now()}`,
      startedAt: new Date(),
      status: "ACTIVE",
      user1Id: me.id,
      user2Id: peer.id,
    },
  })
  return { me, peer, sessionId: session.id }
}

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  ;(livekitClient.publishData as jest.Mock).mockClear()
  ;(livekitClient.publishData as jest.Mock).mockResolvedValue(undefined)
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/matching/sessions/:id/stamp", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/sessions/1/stamp").send({ item_id: 1 })
    expect(res.status).toBe(401)
  })

  it("body 不正 → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "x@example.com", isOnboarded: true, name: "X" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/sessions/1/stamp")
      .set("Authorization", `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it("free スタンプ → 200 + Data Channel publish 呼び出し", async () => {
    const itemId = await seedMatchingStamp()
    const { me, sessionId } = await seedActiveSession()
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${sessionId}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      animation_type: "FLOAT",
      delivered_at: expect.any(Number),
      emoji: "🎉",
      item_id: itemId,
    })
    expect(livekitClient.publishData).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          item_id: itemId,
          sender_id: me.id,
        }),
        topic: "matching:stamp",
      }),
    )
  })

  it("scope=BATTLE のみのスタンプ → 400", async () => {
    const itemId = await seedMatchingStamp({ scope: "BATTLE" })
    const { me, sessionId } = await seedActiveSession()
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${sessionId}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res.status).toBe(400)
  })

  it("premium 所持なし → 403、所持追加後 → 200", async () => {
    const itemId = await seedMatchingStamp({ isPremium: true })
    const { me, sessionId } = await seedActiveSession()
    const token = generateAccessToken(me.id)

    const res1 = await request(app)
      .post(`/api/matching/sessions/${sessionId}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res1.status).toBe(403)
    expect(livekitClient.publishData).not.toHaveBeenCalled()

    /** 所持を追加して再送 */
    await testPrisma.userInventory.create({
      data: { itemId, quantity: 1, userId: me.id },
    })

    const res2 = await request(app)
      .post(`/api/matching/sessions/${sessionId}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res2.status).toBe(200)
    expect(livekitClient.publishData).toHaveBeenCalled()
  })

  it("6 連送で 6 回目に 429（5 req/秒）", async () => {
    const itemId = await seedMatchingStamp()
    const { me, sessionId } = await seedActiveSession()
    const token = generateAccessToken(me.id)

    const statuses: number[] = []
    for (let i = 0; i < 6; i++) {
      const res = await request(app)
        .post(`/api/matching/sessions/${sessionId}/stamp`)
        .set("Authorization", `Bearer ${token}`)
        .send({ item_id: itemId })
      statuses.push(res.status)
    }

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200])
    expect(statuses[5]).toBe(429)
  })

  it("非参加者 → 403", async () => {
    const itemId = await seedMatchingStamp()
    const u1 = await testPrisma.user.create({
      data: { email: "u1@example.com", isOnboarded: true, name: "U1" },
    })
    const u2 = await testPrisma.user.create({
      data: { email: "u2@example.com", isOnboarded: true, name: "U2" },
    })
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:notmine",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res.status).toBe(403)
  })

  it("ENDED → 410", async () => {
    const itemId = await seedMatchingStamp()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        endedAt: new Date(),
        endReason: "MANUAL",
        livekitRoomName: "matching:ended",
        status: "ENDED",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/stamp`)
      .set("Authorization", `Bearer ${token}`)
      .send({ item_id: itemId })

    expect(res.status).toBe(410)
  })
})
