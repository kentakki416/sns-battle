import { Queue } from "bullmq"
import Redis from "ioredis"
import request from "supertest"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
  THEME_PROGRESS_QUEUE_NAME,
  type ThemeProgressJob,
} from "@repo/queue"

import { MatchingSessionStartController } from "../../../src/controller/matching/session-start"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { BullMQThemeProgressEnqueuer } from "../../../src/repository/queue/theme-progress-enqueuer"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
} from "../setup"

/**
 * BullMQ には `maxRetriesPerRequest:null` の connection が必須。
 * 既存 setup の queueRedis を直接使うと cleanupTestRedis の flushdb と競合するため
 * livekit-webhook テストと同じく自前接続を作る。
 */
const buildTestQueueRedis = (): Redis =>
  new Redis({
    db: Number(process.env.REDIS_DB) || 1,
    host: process.env.REDIS_HOST || "localhost",
    maxRetriesPerRequest: null,
    password: process.env.REDIS_PASSWORD || undefined,
    port: Number(process.env.REDIS_PORT) || 6379,
  })

describe("POST /api/matching/sessions/:id/start", () => {
  let testQueueRedis: Redis
  let testQueue: Queue<ThemeProgressJob>

  const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)

  /**
   * Queue は describe 全体で共有し、beforeEach で `obliterate` してジョブだけを掃除する。
   * Controller / app は queue が確定してから組み立てる。
   */
  let app: ReturnType<typeof createTestApp>

  beforeAll(() => {
    testQueueRedis = buildTestQueueRedis()
    testQueue = new Queue<ThemeProgressJob>(THEME_PROGRESS_QUEUE_NAME, {
      connection: testQueueRedis,
    })
    const enqueuer = new BullMQThemeProgressEnqueuer(testQueue)
    const controller = new MatchingSessionStartController(matchingSessionRepository, enqueuer)
    app = createTestApp()
    app.use("/api/matching", matchingRouter({ sessionStart: controller }))
    attachErrorHandler(app)
  })

  beforeEach(async () => {
    await cleanupTestData()
    await cleanupTestRedis()
    await testQueue.obliterate({ force: true })
  })

  afterAll(async () => {
    await cleanupTestData()
    await cleanupTestRedis()
    await testQueue.obliterate({ force: true })
    await testQueue.close()
    await testQueueRedis.quit()
    await disconnectTestDb()
    await disconnectTestRedis()
  })

  it("認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/sessions/1/start")
    expect(res.status).toBe(401)
  })

  it("非数値 id → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/sessions/abc/start")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("存在しないセッション → 404", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/sessions/999999/start")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("非参加者 → 403", async () => {
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
        status: "COUNTDOWN",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/start`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(403)
    /** DB / Queue 共に変化しないこと */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ startedAt: null, status: "COUNTDOWN" })
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 1))).toBeUndefined()
  })

  it("既に ENDED → 410", async () => {
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
      .post(`/api/matching/sessions/${session.id}/start`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(410)
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 1))).toBeUndefined()
  })

  it("正常系（COUNTDOWN → ACTIVE） → 200 / DB が ACTIVE / queue に 3 件 enqueue", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:start",
        status: "COUNTDOWN",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/start`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      session_id: session.id,
      started_at: expect.any(String),
    })

    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ status: "ACTIVE" })
    expect(after?.startedAt).not.toBeNull()

    /** advance-theme(round=1) は delay=0、publish-timer(tick=0) は 30s、session-timeout は 600s */
    const advanceJob = await testQueue.getJob(buildAdvanceThemeJobId(session.id, 1))
    const publishTimerJob = await testQueue.getJob(buildPublishTimerJobId(session.id, 0))
    const timeoutJob = await testQueue.getJob(buildSessionTimeoutJobId(session.id))

    expect(advanceJob).toBeDefined()
    expect(advanceJob?.data).toEqual({
      nextRoundNumber: 1,
      sessionId: session.id,
      type: "advance-theme",
    })
    expect(advanceJob?.opts.delay).toBe(0)

    expect(publishTimerJob).toBeDefined()
    expect(publishTimerJob?.data).toEqual({
      sessionId: session.id,
      tickIndex: 0,
      type: "publish-timer",
    })
    expect(publishTimerJob?.opts.delay).toBe(30_000)

    expect(timeoutJob).toBeDefined()
    expect(timeoutJob?.data).toEqual({
      sessionId: session.id,
      type: "session-timeout",
    })
    expect(timeoutJob?.opts.delay).toBe(600_000)
  })

  it("既に ACTIVE で再 POST → 200 / 既存 startedAt が返る / queue は変化しない", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const startedAt = new Date(Date.now() - 60_000)
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:active",
        startedAt,
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/start`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      session_id: session.id,
      started_at: startedAt.toISOString(),
    })

    /** ACTIVE 経路は enqueue を呼ばないため queue は空のまま */
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 1))).toBeUndefined()
    expect(await testQueue.getJob(buildPublishTimerJobId(session.id, 0))).toBeUndefined()
    expect(await testQueue.getJob(buildSessionTimeoutJobId(session.id))).toBeUndefined()
  })

  it("同じ session に 2 回連続 POST → どちらも 200 / queue 上のジョブは 3 件のまま", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:idempotent",
        status: "COUNTDOWN",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const send = () =>
      request(app)
        .post(`/api/matching/sessions/${session.id}/start`)
        .set("Authorization", `Bearer ${token}`)

    const res1 = await send()
    const res2 = await send()

    expect(res1.status).toBe(200)
    expect(res2.status).toBe(200)
    /** 1 回目で確定した startedAt が 2 回目もそのまま返る（COUNTDOWN→ACTIVE は冪等） */
    expect(res2.body.started_at).toBe(res1.body.started_at)

    /**
     * BullMQ は同一 jobId の重複追加を黙って捨てる。advance-theme / publish-timer / session-timeout
     * の 3 件のみ存在することを確認する。
     */
    const counts = await testQueue.getJobCounts("waiting", "active", "delayed", "completed")
    const total =
            (counts.waiting ?? 0) +
            (counts.active ?? 0) +
            (counts.delayed ?? 0) +
            (counts.completed ?? 0)
    expect(total).toBe(3)
  })
})
