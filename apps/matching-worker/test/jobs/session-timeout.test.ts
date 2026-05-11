import { Queue } from "bullmq"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  THEME_PROGRESS_QUEUE_NAME,
  type ThemeProgressJob,
} from "@repo/queue"

import { ILiveKitDataPublisher } from "../../src/client/livekit"
import { sessionTimeout } from "../../src/jobs/session-timeout"
import { PrismaMatchingSessionRepository } from "../../src/repository/prisma"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testQueueRedis,
  testRedis,
} from "../setup"

const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)

const buildPublisher = (): jest.Mocked<ILiveKitDataPublisher> => ({
  publishData: jest.fn().mockResolvedValue(undefined),
})

const createSession = async (overrides?: {
  status?: "COUNTDOWN" | "ACTIVE" | "ENDED"
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
      startedAt: new Date(),
      status: overrides?.status ?? "ACTIVE",
      user1Id: u1.id,
      user2Id: u2.id,
      ...(overrides?.status === "ENDED"
        ? { endReason: "MANUAL" as const, endedAt: new Date() }
        : {}),
    },
  })
}

describe("sessionTimeout job", () => {
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

  it("【正常系】session 既に ENDED → no-op", async () => {
    const session = await createSession({ status: "ENDED" })
    const publisher = buildPublisher()

    await sessionTimeout(
      { sessionId: session.id, type: "session-timeout" },
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    /** DB の endReason は変化しない（既存 MANUAL のまま） */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: "MANUAL", status: "ENDED" })
  })

  it("【正常系】ACTIVE → ENDED+TIMEOUT、matching:ended publish、関連ジョブが queue から消え、Redis schedule key も削除", async () => {
    const session = await createSession()
    const publisher = buildPublisher()

    /** 関連ジョブと schedule key を事前に仕込む */
    await testQueue.add(
      "advance-theme",
      { nextRoundNumber: 3, sessionId: session.id, type: "advance-theme" },
      { delay: 60_000, jobId: buildAdvanceThemeJobId(session.id, 3) },
    )
    await testQueue.add(
      "publish-timer",
      { sessionId: session.id, tickIndex: 5, type: "publish-timer" },
      { delay: 30_000, jobId: buildPublishTimerJobId(session.id, 5) },
    )
    await testRedis.set(
      `matching:schedule:${session.id}`,
      JSON.stringify([{ durationSeconds: 30, speakerUserKey: "user1", themeId: 1 }]),
      "EX",
      1800,
    )

    await sessionTimeout(
      { sessionId: session.id, type: "session-timeout" },
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    /** DB が ENDED + TIMEOUT */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: "TIMEOUT", status: "ENDED" })
    expect(after?.endedAt).not.toBeNull()

    /** matching:ended が publish された */
    expect(publisher.publishData).toHaveBeenCalledTimes(1)
    expect(publisher.publishData.mock.calls[0][0]).toMatchObject({
      payload: { reason: "TIMEOUT" },
      roomName: session.livekitRoomName,
      topic: "matching:ended",
    })

    /** 仕込んだ delayed ジョブが queue から消えた */
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 3))).toBeUndefined()
    expect(await testQueue.getJob(buildPublishTimerJobId(session.id, 5))).toBeUndefined()

    /** Redis の schedule key が削除された */
    expect(await testRedis.get(`matching:schedule:${session.id}`)).toBeNull()
  })

  it("【正常系】session が存在しない id → no-op", async () => {
    const publisher = buildPublisher()

    await sessionTimeout(
      { sessionId: 999_999, type: "session-timeout" },
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
  })
})
