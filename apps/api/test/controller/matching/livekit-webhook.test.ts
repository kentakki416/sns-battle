import { Queue } from "bullmq"
import express from "express"
import Redis from "ioredis"
import { type WebhookEvent } from "livekit-server-sdk"
import request from "supertest"

import {
  buildLivekitEventJobId,
  WEBHOOK_EVENTS_QUEUE_NAME,
  type WebhookEventsJob,
} from "@repo/queue"

import { ILiveKitWebhookReceiver } from "../../../src/client/livekit"
import { LiveKitWebhookController } from "../../../src/controller/matching/livekit-webhook"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler } from "../helper"
import {
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
} from "../setup"

/**
 * 本ルート専用に raw body middleware を使う必要があるため、helper の createTestApp() は使わず
 * authMiddleware を経由しない最小構成のテスト用 app を組む（PUBLIC_PATHS に含まれているため
 * 本番でも auth は通過する）。
 */
const buildApp = (controller: LiveKitWebhookController): express.Express => {
  const app = express()
  app.use("/api/matching", matchingRouter({ livekitWebhook: controller }))
  attachErrorHandler(app)
  return app
}

/**
 * BullMQ には maxRetriesPerRequest:null が必須。テスト用に専用 connection を作る。
 * 既存 setup の queueRedis を直接使うと cleanupTestRedis の flushdb と競合するため
 * 自前接続にする。
 */
const buildTestQueueRedis = (): Redis =>
  new Redis({
    db: Number(process.env.REDIS_DB) || 1,
    host: process.env.REDIS_HOST || "localhost",
    maxRetriesPerRequest: null,
    password: process.env.REDIS_PASSWORD || undefined,
    port: Number(process.env.REDIS_PORT) || 6379,
  })

/**
 * LiveKit SDK の WebhookEvent を最小限モック。
 * Controller が触るのは event / id / room?.name / toJson() のみ。
 * `toJson()` は overrides を反映した最終値を返すよう、props を生成後に組み立てる。
 */
const buildMockEvent = (overrides?: Partial<WebhookEvent>): WebhookEvent => {
  const props = {
    createdAt: 1234567890,
    event: "participant_left" as const,
    id: "evt-xxx",
    room: { name: "matching:42" },
    ...overrides,
  }
  const mock = {
    ...props,
    toJson: () => ({ ...props }),
  }
  return mock as unknown as WebhookEvent
}

describe("POST /api/matching/livekit-webhook", () => {
  let testQueueRedis: Redis
  let testQueue: Queue<WebhookEventsJob>

  beforeAll(() => {
    testQueueRedis = buildTestQueueRedis()
    testQueue = new Queue<WebhookEventsJob>(WEBHOOK_EVENTS_QUEUE_NAME, {
      connection: testQueueRedis,
    })
  })

  beforeEach(async () => {
    await cleanupTestRedis()
    await testQueue.obliterate({ force: true })
  })

  afterAll(async () => {
    await testQueue.obliterate({ force: true })
    await testQueue.close()
    await testQueueRedis.quit()
    await disconnectTestDb()
    await disconnectTestRedis()
  })

  it("【異常系】無効署名（receiver が null）→ 401 / enqueue されない", async () => {
    const receiver: ILiveKitWebhookReceiver = {
      receive: jest.fn().mockResolvedValue(null),
    }
    const controller = new LiveKitWebhookController(receiver, testQueue)
    const app = buildApp(controller)

    const res = await request(app)
      .post("/api/matching/livekit-webhook")
      .set("Content-Type", "application/webhook+json")
      .send(JSON.stringify({ event: "participant_left", id: "evt-1" }))

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
    expect(await testQueue.getJob(buildLivekitEventJobId("evt-1"))).toBeUndefined()
  })

  it("【異常系】Authorization 無し → receiver も null を返す → 401", async () => {
    const receiver: ILiveKitWebhookReceiver = {
      receive: jest.fn().mockImplementation(async (_body, auth) => (auth ? buildMockEvent() : null)),
    }
    const controller = new LiveKitWebhookController(receiver, testQueue)
    const app = buildApp(controller)

    const res = await request(app)
      .post("/api/matching/livekit-webhook")
      .set("Content-Type", "application/webhook+json")
      .send(JSON.stringify({ event: "participant_left", id: "evt-x" }))

    expect(res.status).toBe(401)
    expect(receiver.receive).toHaveBeenCalledWith(expect.any(String), undefined)
  })

  it("【正常系】有効署名 → 204 / BullMQ に jobId=livekit:{eventId} で enqueue", async () => {
    const event = buildMockEvent({ id: "evt-success" })
    const receiver: ILiveKitWebhookReceiver = {
      receive: jest.fn().mockResolvedValue(event),
    }
    const controller = new LiveKitWebhookController(receiver, testQueue)
    const app = buildApp(controller)

    const res = await request(app)
      .post("/api/matching/livekit-webhook")
      .set("Authorization", "any-jwt-token")
      .set("Content-Type", "application/webhook+json")
      .send(JSON.stringify({ event: "participant_left", id: "evt-success" }))

    expect(res.status).toBe(204)

    const job = await testQueue.getJob(buildLivekitEventJobId("evt-success"))
    expect(job).toBeDefined()
    expect(job?.data).toMatchObject({
      event: expect.objectContaining({ event: "participant_left", id: "evt-success" }),
      eventId: "evt-success",
      type: "livekit-event",
    })
  })

  it("【正常系】受信 body は raw（Buffer）として receiver に渡される（JSON parse されていない）", async () => {
    const receiver: ILiveKitWebhookReceiver = {
      receive: jest.fn().mockResolvedValue(buildMockEvent()),
    }
    const controller = new LiveKitWebhookController(receiver, testQueue)
    const app = buildApp(controller)

    const rawJson = JSON.stringify({ event: "participant_left", id: "evt-raw" })
    await request(app)
      .post("/api/matching/livekit-webhook")
      .set("Authorization", "any-jwt-token")
      .set("Content-Type", "application/webhook+json")
      .send(rawJson)

    /** receive(rawBody, authHeader) の rawBody が元の JSON 文字列と完全一致すること */
    expect(receiver.receive).toHaveBeenCalledWith(rawJson, "any-jwt-token")
  })

  it("【正常系】同一 event.id で 2 回 POST → 2 回目は同 jobId で重複追加されず、ジョブ 1 件のまま", async () => {
    const event = buildMockEvent({ id: "evt-dup" })
    const receiver: ILiveKitWebhookReceiver = {
      receive: jest.fn().mockResolvedValue(event),
    }
    const controller = new LiveKitWebhookController(receiver, testQueue)
    const app = buildApp(controller)

    const send = () =>
      request(app)
        .post("/api/matching/livekit-webhook")
        .set("Authorization", "any-jwt-token")
        .set("Content-Type", "application/webhook+json")
        .send(JSON.stringify({ event: "participant_left", id: "evt-dup" }))

    const res1 = await send()
    const res2 = await send()

    expect(res1.status).toBe(204)
    expect(res2.status).toBe(204)

    /** BullMQ は同一 jobId の重複追加を黙って捨てる。queue 上には 1 件のみ */
    const counts = await testQueue.getJobCounts("waiting", "active", "delayed", "completed")
    const total =
            (counts.waiting ?? 0) +
            (counts.active ?? 0) +
            (counts.delayed ?? 0) +
            (counts.completed ?? 0)
    expect(total).toBe(1)
  })
})
