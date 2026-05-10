import request from "supertest"

import { MatchingJoinController } from "../../../src/controller/matching/join"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaBlockRepository } from "../../../src/repository/prisma/block-repository"
import { PrismaMatchingQueueRepository } from "../../../src/repository/prisma/matching-queue-repository"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { IoRedisMatchingEventPublisher } from "../../../src/repository/redis/matching-event-publisher"
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

const blockRepository = new PrismaBlockRepository(testPrisma)
const matchingQueueRepository = new PrismaMatchingQueueRepository(testPrisma)
const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)
const userRepository = new PrismaUserRepository(testPrisma)
const matchingQueueRedisRepository = new IoRedisMatchingQueueRepository(testRedis)
const matchingEventPublisher = new IoRedisMatchingEventPublisher(testRedis)

const matchingJoinController = new MatchingJoinController(
  blockRepository,
  matchingEventPublisher,
  matchingQueueRedisRepository,
  matchingQueueRepository,
  matchingSessionRepository,
  userRepository,
)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ join: matchingJoinController }))
attachErrorHandler(app)

const createOnboardedUser = async (suffix: string) => {
  return testPrisma.user.create({
    data: {
      avatarUrl: `https://example.com/${suffix}.jpg`,
      birthDate: new Date("1995-01-01"),
      email: `${suffix}@example.com`,
      gender: "FEMALE",
      isOnboarded: true,
      name: `User ${suffix}`,
    },
  })
}

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

describe("POST /api/matching/join", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/join")
    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })

  it("isOnboarded=false → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: false, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/join")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("待機者ゼロ → 200, matched: false、Redis に登録される", async () => {
    const me = await createOnboardedUser("me")
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/join")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      livekit_room_name: null,
      matched: false,
      peer: null,
      session_id: null,
    })

    /** Redis Sorted Set に自分が登録されていることを確認 */
    const score = await testRedis.zscore("matching:queue", String(me.id))
    expect(score).not.toBeNull()
    /** DB の matching_queue にも WAITING で登録される */
    const queueRow = await testPrisma.matchingQueue.findUnique({ where: { userId: me.id } })
    expect(queueRow).toMatchObject({ status: "WAITING", userId: me.id })
  })

  it("既に WAITING のユーザーが再 join → 409", async () => {
    const me = await createOnboardedUser("me")
    const token = generateAccessToken(me.id)

    await request(app).post("/api/matching/join").set("Authorization", `Bearer ${token}`)
    const res = await request(app)
      .post("/api/matching/join")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(409)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 409 })
  })

  it("待機者 1 人（ブロックなし）→ matched: true、セッション作成、両者キュー削除", async () => {
    const peer = await createOnboardedUser("peer")
    const me = await createOnboardedUser("me")
    /** peer が先に join */
    await testRedis.zadd("matching:queue", Date.now() - 1000, String(peer.id))
    await testPrisma.matchingQueue.create({ data: { status: "WAITING", userId: peer.id } })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/join")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      livekit_room_name: expect.stringMatching(/^matching:\d+$/),
      matched: true,
      peer: {
        avatar_url: peer.avatarUrl,
        id: peer.id,
        name: peer.name,
      },
      session_id: expect.any(Number),
    })

    /** matching_sessions に行が作られている */
    const session = await testPrisma.matchingSession.findUnique({
      where: { id: res.body.session_id },
    })
    expect(session).toMatchObject({
      livekitRoomName: `matching:${res.body.session_id}`,
      status: "COUNTDOWN",
      user1Id: me.id,
      user2Id: peer.id,
    })
    /** 両者は Redis / DB のキューから削除されている */
    expect(await testRedis.zscore("matching:queue", String(me.id))).toBeNull()
    expect(await testRedis.zscore("matching:queue", String(peer.id))).toBeNull()
    expect(await testPrisma.matchingQueue.findUnique({ where: { userId: me.id } })).toBeNull()
    expect(await testPrisma.matchingQueue.findUnique({ where: { userId: peer.id } })).toBeNull()
  })

  it("ブロック関係がある相手 → matched: false（自分は WAITING のまま）", async () => {
    const peer = await createOnboardedUser("peer")
    const me = await createOnboardedUser("me")
    await testPrisma.block.create({
      data: { blockedId: peer.id, blockerId: me.id },
    })
    await testRedis.zadd("matching:queue", Date.now() - 1000, String(peer.id))
    await testPrisma.matchingQueue.create({ data: { status: "WAITING", userId: peer.id } })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/join")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      livekit_room_name: null,
      matched: false,
      peer: null,
      session_id: null,
    })
    /** 自分は WAITING のまま、peer もそのまま */
    expect(await testRedis.zscore("matching:queue", String(me.id))).not.toBeNull()
    expect(await testRedis.zscore("matching:queue", String(peer.id))).not.toBeNull()
  })
})
