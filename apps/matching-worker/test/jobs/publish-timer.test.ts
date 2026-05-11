import { Queue } from "bullmq"

import {
  buildPublishTimerJobId,
  THEME_PROGRESS_QUEUE_NAME,
  type ThemeProgressJob,
} from "@repo/queue"

import { ILiveKitDataPublisher } from "../../src/client/livekit"
import { publishTimer } from "../../src/jobs/publish-timer"
import { PrismaMatchingSessionRepository } from "../../src/repository/prisma"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testQueueRedis,
} from "../setup"

const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)

const buildPublisher = (): jest.Mocked<ILiveKitDataPublisher> => ({
  publishData: jest.fn().mockResolvedValue(undefined),
})

const createSession = async (overrides: {
  startedAt: Date | null
  status: "COUNTDOWN" | "ACTIVE" | "ENDED"
}) => {
  const u1 = await testPrisma.user.create({
    data: { email: `u1-${Date.now()}@example.com`, isOnboarded: true, name: "U1" },
  })
  const u2 = await testPrisma.user.create({
    data: { email: `u2-${Date.now()}@example.com`, isOnboarded: true, name: "U2" },
  })
  return testPrisma.matchingSession.create({
    data: {
      livekitRoomName: `matching:t-${Date.now()}`,
      startedAt: overrides.startedAt,
      status: overrides.status,
      user1Id: u1.id,
      user2Id: u2.id,
    },
  })
}

describe("publishTimer job", () => {
  let testQueue: Queue<ThemeProgressJob>

  beforeAll(() => {
    testQueue = new Queue<ThemeProgressJob>(THEME_PROGRESS_QUEUE_NAME, {
      connection: testQueueRedis,
    })
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
    await disconnectTestDb()
    await disconnectTestRedis()
  })

  it("【正常系】session ENDED → no-op", async () => {
    const session = await createSession({ startedAt: new Date(), status: "ENDED" })
    const publisher = buildPublisher()

    await publishTimer(
      { sessionId: session.id, tickIndex: 0, type: "publish-timer" },
      { livekitDataPublisher: publisher, matchingSessionRepository, themeProgressQueue: testQueue },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    expect(await testQueue.getJob(buildPublishTimerJobId(session.id, 1))).toBeUndefined()
  })

  it("【正常系】startedAt=null（COUNTDOWN）→ no-op", async () => {
    const session = await createSession({ startedAt: null, status: "COUNTDOWN" })
    const publisher = buildPublisher()

    await publishTimer(
      { sessionId: session.id, tickIndex: 0, type: "publish-timer" },
      { livekitDataPublisher: publisher, matchingSessionRepository, themeProgressQueue: testQueue },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
  })

  it("【正常系】elapsed < 300 秒 → can_end_now=false で publish + 30 秒後の次 tick が enqueue", async () => {
    /** 60 秒前 startedAt → elapsed=60 / remaining=540 */
    const session = await createSession({
      startedAt: new Date(Date.now() - 60_000),
      status: "ACTIVE",
    })
    const publisher = buildPublisher()

    await publishTimer(
      { sessionId: session.id, tickIndex: 0, type: "publish-timer" },
      { livekitDataPublisher: publisher, matchingSessionRepository, themeProgressQueue: testQueue },
    )

    expect(publisher.publishData).toHaveBeenCalledTimes(1)
    expect(publisher.publishData.mock.calls[0][0]).toMatchObject({
      payload: { can_end_now: false, remaining_seconds: expect.any(Number) },
      roomName: session.livekitRoomName,
      topic: "matching:timer",
    })
    /** remaining は 540 前後（CI 揺れを考慮して範囲チェック） */
    const sentPayload = publisher.publishData.mock.calls[0][0].payload as {
      can_end_now: boolean
      remaining_seconds: number
    }
    expect(sentPayload.remaining_seconds).toBeGreaterThanOrEqual(539)
    expect(sentPayload.remaining_seconds).toBeLessThanOrEqual(541)

    const nextJob = await testQueue.getJob(buildPublishTimerJobId(session.id, 1))
    expect(nextJob).toBeDefined()
    expect(nextJob?.opts.delay).toBe(30_000)
  })

  it("【正常系】elapsed >= 300 秒 → can_end_now=true", async () => {
    const session = await createSession({
      startedAt: new Date(Date.now() - 5 * 60_000 - 1000),
      status: "ACTIVE",
    })
    const publisher = buildPublisher()

    await publishTimer(
      { sessionId: session.id, tickIndex: 5, type: "publish-timer" },
      { livekitDataPublisher: publisher, matchingSessionRepository, themeProgressQueue: testQueue },
    )

    expect(publisher.publishData.mock.calls[0][0]).toMatchObject({
      payload: { can_end_now: true, remaining_seconds: expect.any(Number) },
    })
  })

  it("【正常系】残り 0 秒以下（10 分超過）→ no-op、次 tick も enqueue されない", async () => {
    const session = await createSession({
      startedAt: new Date(Date.now() - 11 * 60_000),
      status: "ACTIVE",
    })
    const publisher = buildPublisher()

    await publishTimer(
      { sessionId: session.id, tickIndex: 0, type: "publish-timer" },
      { livekitDataPublisher: publisher, matchingSessionRepository, themeProgressQueue: testQueue },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    expect(await testQueue.getJob(buildPublishTimerJobId(session.id, 1))).toBeUndefined()
  })
})
