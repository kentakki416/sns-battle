import { Queue } from "bullmq"

import {
  buildAdvanceThemeJobId,
  THEME_PROGRESS_QUEUE_NAME,
  type ThemeProgressJob,
} from "@repo/queue"

import { ILiveKitDataPublisher } from "../../src/client/livekit"
import { advanceTheme } from "../../src/jobs/advance-theme"
import {
  PrismaMatchingSessionRepository,
  PrismaTalkThemeRepository,
} from "../../src/repository/prisma"
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
const talkThemeRepository = new PrismaTalkThemeRepository(testPrisma)

const buildPublisher = (): jest.Mocked<ILiveKitDataPublisher> => ({
  publishData: jest.fn().mockResolvedValue(undefined),
})

/**
 * 各テストで CHOICE / FREE_TALK のテーマを最低 1 件ずつ作る。テーマ duration は 1 秒に固定し、
 * 次ラウンド再 enqueue の delay 検証だけ行う（実時間は待たない）。
 */
const seedThemes = async (): Promise<void> => {
  await testPrisma.talkTheme.create({
    data: {
      category: "MATCHING",
      duration: 1,
      isActive: true,
      sortOrder: 1,
      title: "FREE 1",
      type: "FREE_TALK",
    },
  })
  const choice = await testPrisma.talkTheme.create({
    data: {
      category: "MATCHING",
      duration: 1,
      isActive: true,
      sortOrder: 2,
      title: "CHOICE 1",
      type: "CHOICE",
    },
  })
  await testPrisma.talkThemeChoice.createMany({
    data: [
      { emoji: "🍣", label: "寿司", sortOrder: 1, themeId: choice.id },
      { emoji: "🍕", label: "ピザ", sortOrder: 2, themeId: choice.id },
    ],
  })
}

const createSessionWithUsers = async (overrides?: {
  status?: "COUNTDOWN" | "ACTIVE" | "ENDED"
  startedAt?: Date | null
}) => {
  const u1 = await testPrisma.user.create({
    data: { email: `u1-${Date.now()}@example.com`, isOnboarded: true, name: "U1" },
  })
  const u2 = await testPrisma.user.create({
    data: { email: `u2-${Date.now()}@example.com`, isOnboarded: true, name: "U2" },
  })
  return testPrisma.matchingSession.create({
    data: {
      livekitRoomName: `matching:test-${Date.now()}`,
      startedAt: overrides?.startedAt ?? new Date(),
      status: overrides?.status ?? "ACTIVE",
      user1Id: u1.id,
      user2Id: u2.id,
    },
  })
}

describe("advanceTheme job", () => {
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
    await seedThemes()
  })

  afterAll(async () => {
    await cleanupTestData()
    await cleanupTestRedis()
    await testQueue.obliterate({ force: true })
    await testQueue.close()
    await disconnectTestDb()
    await disconnectTestRedis()
  })

  it("schedule が Redis に無い場合は生成して保存される", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    const promise = advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )
    /** round=1 は hype を出さないので tick advance 不要 */
    await promise

    const cached = await testRedis.get(`matching:schedule:${session.id}`)
    expect(cached).not.toBeNull()
    const schedule = JSON.parse(cached!)
    expect(schedule).toHaveLength(10)
    /** TTL も設定されていること */
    const ttl = await testRedis.ttl(`matching:schedule:${session.id}`)
    expect(ttl).toBeGreaterThan(0)
    expect(ttl).toBeLessThanOrEqual(1800)
  })

  it("round=1 は matching:hype を publish せず matching:theme のみ", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    await advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    const calls = publisher.publishData.mock.calls.map((c) => c[0])
    expect(calls.map((c) => c.topic)).toEqual(["matching:theme"])
    expect(calls[0]).toMatchObject({
      payload: expect.objectContaining({ round_number: 1 }),
      roomName: session.livekitRoomName,
    })
  })

  it("round=2 は matching:hype → matching:theme の順で publish", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    /** round=1 を先に走らせて schedule を Redis に確定させる */
    await advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )
    publisher.publishData.mockClear()

    await advanceTheme(
      { nextRoundNumber: 2, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    const topics = publisher.publishData.mock.calls.map((c) => c[0].topic)
    expect(topics).toEqual(["matching:hype", "matching:theme"])
  })

  it("round<10 のとき次ラウンドの advance-theme が delay=duration*1000 で再 enqueue", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    await advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    const nextJob = await testQueue.getJob(buildAdvanceThemeJobId(session.id, 2))
    expect(nextJob).toBeDefined()
    expect(nextJob?.opts.delay).toBe(1000)
    expect(nextJob?.data).toMatchObject({
      nextRoundNumber: 2,
      sessionId: session.id,
      type: "advance-theme",
    })
  })

  it("round=10（最終ラウンド）は次ラウンドを再 enqueue しない", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    await advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    await advanceTheme(
      { nextRoundNumber: 10, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 11))).toBeUndefined()
  })

  it("session が ENDED → no-op（publish も enqueue もされない）", async () => {
    const session = await createSessionWithUsers({ status: "ENDED" })
    const publisher = buildPublisher()

    await advanceTheme(
      { nextRoundNumber: 1, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
    expect(await testQueue.getJob(buildAdvanceThemeJobId(session.id, 2))).toBeUndefined()
    expect(await testRedis.get(`matching:schedule:${session.id}`)).toBeNull()
  })

  it("nextRoundNumber > 10 → no-op", async () => {
    const session = await createSessionWithUsers()
    const publisher = buildPublisher()

    await advanceTheme(
      { nextRoundNumber: 11, sessionId: session.id, type: "advance-theme" },
      {
        hypeDelayMs: 0,
        livekitDataPublisher: publisher,
        matchingSessionRepository,
        redis: testRedis,
        talkThemeRepository,
        themeProgressQueue: testQueue,
      },
    )

    expect(publisher.publishData).not.toHaveBeenCalled()
  })
})
