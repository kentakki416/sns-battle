import request from "supertest"

import { MatchingSessionDetailController } from "../../../src/controller/matching/session-detail"
import { MatchingSessionEndController } from "../../../src/controller/matching/session-end"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
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
const userRepository = new PrismaUserRepository(testPrisma)
const sessionDetailController = new MatchingSessionDetailController(
  matchingSessionRepository,
  userRepository,
)
const sessionEndController = new MatchingSessionEndController(matchingSessionRepository)

const app = createTestApp()
app.use(
  "/api/matching",
  matchingRouter({
    sessionDetail: sessionDetailController,
    sessionEnd: sessionEndController,
  }),
)
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

describe("GET /api/matching/sessions/:id", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/matching/sessions/1")
    expect(res.status).toBe(401)
  })

  it("【異常系】非数値 id → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/sessions/abc")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】存在しないセッション → 404", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/sessions/999999")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it("【異常系】非参加者 → 403", async () => {
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
        livekitRoomName: "matching:t",
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/matching/sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  it("【正常系】user1 として取得 → 200 + is_self_user1=true / can_end_now=true（5 分以上経過）", async () => {
    const me = await testPrisma.user.create({
      data: {
        avatarUrl: "https://example.com/me.png",
        email: "me@example.com",
        isOnboarded: true,
        name: "Me",
      },
    })
    const peer = await testPrisma.user.create({
      data: {
        avatarUrl: "https://example.com/peer.png",
        email: "peer@example.com",
        isOnboarded: true,
        name: "Peer",
      },
    })
    const startedAt = new Date(Date.now() - 6 * 60 * 1000) // 6 分前
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:42",
        startedAt,
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/matching/sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      can_end_now: true,
      elapsed_seconds: expect.any(Number),
      ended_at: null,
      end_reason: null,
      id: session.id,
      is_self_user1: true,
      livekit_room_name: "matching:42",
      started_at: expect.any(String),
      status: "ACTIVE",
      user1: { id: me.id, avatar_url: "https://example.com/me.png", name: "Me" },
      user2: { id: peer.id, avatar_url: "https://example.com/peer.png", name: "Peer" },
    })
    expect(res.body.elapsed_seconds).toBeGreaterThanOrEqual(360)
  })

  it("【正常系】COUNTDOWN セッション → elapsed_seconds=0 / can_end_now=false", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:cd",
        status: "COUNTDOWN",
        user1Id: peer.id,
        user2Id: me.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/matching/sessions/${session.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      can_end_now: false,
      elapsed_seconds: 0,
      is_self_user1: false,
      started_at: null,
      status: "COUNTDOWN",
    })
  })
})

describe("POST /api/matching/sessions/:id/end", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/sessions/1/end")
    expect(res.status).toBe(401)
  })

  it("【異常系】存在しないセッション → 404", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/sessions/999999/end")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
  })

  it("【異常系】非参加者 → 403", async () => {
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
        livekitRoomName: "matching:t",
        startedAt: new Date(Date.now() - 6 * 60 * 1000),
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/end`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  it("【異常系】既に ENDED → 410", async () => {
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
        livekitRoomName: "matching:e",
        status: "ENDED",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/end`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(410)
  })

  it("【異常系】5 分未満 → 400 / DB は変化しない", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:young",
        startedAt: new Date(Date.now() - 30 * 1000),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/end`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endedAt: null, endReason: null, status: "ACTIVE" })
  })

  it("【正常系】5 分以上経過 → 200 / DB が ENDED + endReason=MANUAL に更新される", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:end",
        startedAt: new Date(Date.now() - 6 * 60 * 1000),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/end`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      ended_at: expect.any(String),
      end_reason: "MANUAL",
      id: session.id,
      status: "ENDED",
    })

    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({
      endReason: "MANUAL",
      status: "ENDED",
    })
    expect(after?.endedAt).not.toBeNull()
  })
})
