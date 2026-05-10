import request from "supertest"

import { ILiveKitClient } from "../../../src/client/livekit"
import { MatchingTokenController } from "../../../src/controller/matching/token"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
} from "../setup"

const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)

/**
 * LiveKit は外部 SaaS なので mock 固定で OK。
 * 実 JWT 検証は Service ユニットテストの責務（ここでは Controller の HTTP 経路を検証）。
 */
const livekitClient: ILiveKitClient = {
  generateRoomToken: jest.fn().mockResolvedValue("fake-jwt-token"),
}
const livekitUrl = "https://dummy.livekit.cloud"

const matchingTokenController = new MatchingTokenController(
  livekitClient,
  livekitUrl,
  matchingSessionRepository,
)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ token: matchingTokenController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  ;(livekitClient.generateRoomToken as jest.Mock).mockClear()
  ;(livekitClient.generateRoomToken as jest.Mock).mockResolvedValue("fake-jwt-token")
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/matching/token", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/token").send({ session_id: 1 })
    expect(res.status).toBe(401)
  })

  it("不正な body → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/token")
      .set("Authorization", `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("存在しないセッション → 404", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/token")
      .set("Authorization", `Bearer ${token}`)
      .send({ session_id: 999_999 })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("参加者本人 → 200 + token / livekit_url / room_name / expires_at を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:42",
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/token")
      .set("Authorization", `Bearer ${token}`)
      .send({ session_id: session.id })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      expires_at: expect.any(Number),
      livekit_url: "https://dummy.livekit.cloud",
      room_name: "matching:42",
      token: "fake-jwt-token",
    })
    expect(livekitClient.generateRoomToken).toHaveBeenCalledWith({
      identity: `user:${me.id}`,
      roomName: "matching:42",
      ttlSeconds: 3600,
    })
  })

  it("参加者でない → 403", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const u1 = await testPrisma.user.create({
      data: { email: "u1@example.com", isOnboarded: true, name: "U1" },
    })
    const u2 = await testPrisma.user.create({
      data: { email: "u2@example.com", isOnboarded: true, name: "U2" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:test",
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/token")
      .set("Authorization", `Bearer ${token}`)
      .send({ session_id: session.id })

    expect(res.status).toBe(403)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 403 })
    expect(livekitClient.generateRoomToken).not.toHaveBeenCalled()
  })

  it("ENDED セッション → 410", async () => {
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
      .post("/api/matching/token")
      .set("Authorization", `Bearer ${token}`)
      .send({ session_id: session.id })

    expect(res.status).toBe(410)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 410 })
    expect(livekitClient.generateRoomToken).not.toHaveBeenCalled()
  })
})
