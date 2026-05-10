import { Queue } from "bullmq"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
  THEME_PROGRESS_QUEUE_NAME,
  type LivekitEventJob,
  type ThemeProgressJob,
} from "@repo/queue"

import { ILiveKitDataPublisher } from "../../src/client/livekit"
import { livekitEvent } from "../../src/jobs/livekit-event"
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

/**
 * LiveKit Webhook event の最小モック。job データ上は `Record<string, unknown>` 扱いなので
 * `event.event` / `event.room.name` だけ満たせばジョブの分岐検証ができる。
 */
const buildLivekitEventJob = (overrides: {
  eventName: string
  eventId?: string
  roomName?: string
}): LivekitEventJob => ({
  event: {
    createdAt: 1234567890,
    event: overrides.eventName,
    id: overrides.eventId ?? "evt-test",
    ...(overrides.roomName !== undefined ? { room: { name: overrides.roomName } } : {}),
  },
  eventId: overrides.eventId ?? "evt-test",
  type: "livekit-event",
})

const createSession = async (overrides?: {
  status?: "COUNTDOWN" | "ACTIVE" | "ENDED"
}) => {
  const u1 = await testPrisma.user.create({
    data: { email: `u1-${Date.now()}-${Math.random()}@example.com`, isOnboarded: true, name: "U1" },
  })
  const u2 = await testPrisma.user.create({
    data: { email: `u2-${Date.now()}-${Math.random()}@example.com`, isOnboarded: true, name: "U2" },
  })
  return testPrisma.matchingSession.create({
    data: {
      livekitRoomName: `matching:t-${Date.now()}-${Math.random()}`,
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

describe("livekitEvent job", () => {
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

  it("participant_left → ENDED+USER_LEFT、matching:ended publish、関連ジョブ削除、schedule key 削除", async () => {
    const session = await createSession()
    const publisher = buildPublisher()

    /** session 専用の room.name に揃え、関連 delayed ジョブと schedule key を仕込む */
    await testPrisma.matchingSession.update({
      data: { livekitRoomName: `matching:${session.id}` },
      where: { id: session.id },
    })
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
    await testQueue.add(
      "session-timeout",
      { sessionId: session.id, type: "session-timeout" },
      { delay: 600_000, jobId: buildSessionTimeoutJobId(session.id) },
    )
    await testRedis.set(
      `matching:schedule:${session.id}`,
      JSON.stringify([{ durationSeconds: 30, speakerUserKey: "user1", themeId: 1 }]),
      "EX",
      1800,
    )

    await livekitEvent(
      buildLivekitEventJob({
        eventId: "evt-pl",
        eventName: "participant_left",
        roomName: `matching:${session.id}`,
      }),
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    /** DB が ENDED + USER_LEFT */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: "USER_LEFT", status: "ENDED" })
    expect(after?.endedAt).not.toBeNull()

    /** matching:ended が publish された */
    expect(publisher.publishData).toHaveBeenCalledTimes(1)
    expect(publisher.publishData.mock.calls[0][0]).toMatchObject({
      payload: { reason: "USER_LEFT" },
      roomName: `matching:${session.id}`,
      topic: "matching:ended",
    })

    /** 仕込んだ delayed ジョブが queue から消えた */
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 3))).toBeUndefined()
    expect(await testQueue.getJob(buildPublishTimerJobId(session.id, 5))).toBeUndefined()
    expect(await testQueue.getJob(buildSessionTimeoutJobId(session.id))).toBeUndefined()

    /** Redis の schedule key が削除された */
    expect(await testRedis.get(`matching:schedule:${session.id}`)).toBeNull()
  })

  it("room_finished → ENDED+USER_LEFT、matching:ended publish、関連ジョブ削除、schedule key 削除", async () => {
    const session = await createSession()
    const publisher = buildPublisher()

    await testPrisma.matchingSession.update({
      data: { livekitRoomName: `matching:${session.id}` },
      where: { id: session.id },
    })
    await testQueue.add(
      "advance-theme",
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      { delay: 60_000, jobId: buildAdvanceThemeJobId(session.id, 1) },
    )
    await testRedis.set(
      `matching:schedule:${session.id}`,
      JSON.stringify([{ durationSeconds: 30, speakerUserKey: "user1", themeId: 1 }]),
      "EX",
      1800,
    )

    await livekitEvent(
      buildLivekitEventJob({
        eventId: "evt-rf",
        eventName: "room_finished",
        roomName: `matching:${session.id}`,
      }),
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: "USER_LEFT", status: "ENDED" })

    expect(publisher.publishData).toHaveBeenCalledTimes(1)
    expect(publisher.publishData.mock.calls[0][0]).toMatchObject({
      payload: { reason: "USER_LEFT" },
      roomName: `matching:${session.id}`,
      topic: "matching:ended",
    })

    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 1))).toBeUndefined()
    expect(await testRedis.get(`matching:schedule:${session.id}`)).toBeNull()
  })

  it("session が既に ENDED → no-op（DB / publish / queue / Redis を変更しない）", async () => {
    const session = await createSession({ status: "ENDED" })
    const publisher = buildPublisher()

    await testPrisma.matchingSession.update({
      data: { livekitRoomName: `matching:${session.id}` },
      where: { id: session.id },
    })
    /** schedule key を仕込んでおき、no-op で残ることを確認 */
    await testRedis.set(`matching:schedule:${session.id}`, "should-stay")

    await livekitEvent(
      buildLivekitEventJob({
        eventId: "evt-already-ended",
        eventName: "participant_left",
        roomName: `matching:${session.id}`,
      }),
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    /** publish されない */
    expect(publisher.publishData).not.toHaveBeenCalled()

    /** DB の endReason は MANUAL のまま（USER_LEFT に上書きされない） */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: "MANUAL", status: "ENDED" })

    /** Redis の schedule key も残る */
    expect(await testRedis.get(`matching:schedule:${session.id}`)).toBe("should-stay")
  })

  it("マッチング以外の room（room.name=battle:1）→ 無視（DB / publish に副作用なし）", async () => {
    const session = await createSession()
    const publisher = buildPublisher()

    await livekitEvent(
      buildLivekitEventJob({
        eventId: "evt-non-matching",
        eventName: "participant_left",
        roomName: "battle:1",
      }),
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    /** session は ACTIVE のまま */
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: null, status: "ACTIVE" })
  })

  it("マッチング機能で扱わないイベント（track_published）→ 無視（DB / publish に副作用なし）", async () => {
    const session = await createSession()
    const publisher = buildPublisher()

    await testPrisma.matchingSession.update({
      data: { livekitRoomName: `matching:${session.id}` },
      where: { id: session.id },
    })

    await livekitEvent(
      buildLivekitEventJob({
        eventId: "evt-track",
        eventName: "track_published",
        roomName: `matching:${session.id}`,
      }),
      {
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    const after = await testPrisma.matchingSession.findUnique({ where: { id: session.id } })
    expect(after).toMatchObject({ endReason: null, status: "ACTIVE" })
  })
})
