import http from "node:http"
import type { AddressInfo } from "node:net"

import express from "express"

import { MatchingEventsController } from "../../../src/controller/matching/events"
import { generateAccessToken } from "../../../src/lib/jwt"
import { IoRedisMatchingEventPublisher } from "../../../src/repository/redis/matching-event-publisher"
import { IoRedisMatchingEventSubscriber } from "../../../src/repository/redis/matching-event-subscriber"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
  testRedis,
  testRedisSubscriber,
} from "../setup"

/**
 * subscribe 専用の接続には testRedisSubscriber を使い、publish には testRedis を使う。
 * （ioredis は subscribe モードに入ると同接続で publish できないため別接続が必須）
 */
const matchingEventSubscriber = new IoRedisMatchingEventSubscriber(testRedisSubscriber)
const matchingEventPublisher = new IoRedisMatchingEventPublisher(testRedis)
const matchingEventsController = new MatchingEventsController(matchingEventSubscriber)

let app: express.Express
let server: http.Server
let baseUrl: string

beforeAll(async () => {
  app = createTestApp()
  app.use("/api/matching", matchingRouter({ events: matchingEventsController }))
  attachErrorHandler(app)
  server = http.createServer(app)
  await new Promise<void>((resolve) => server.listen(0, resolve))
  const port = (server.address() as AddressInfo).port
  baseUrl = `http://127.0.0.1:${port}`
})

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
})

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

/**
 * SSE エンドポイントへ接続し、buffer に `until(buffer) === true` を満たす内容が
 * 揃うまで待つ。揃ったら接続を切ってバッファを返す。
 */
const openSseAndCollect = async (
  path: string,
  token: string,
  until: (buffer: string) => boolean,
  timeoutMs: number,
): Promise<{ buffer: string; status: number | undefined }> => {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl)
    const req = http.request(
      {
        headers: { authorization: `Bearer ${token}` },
        host: url.hostname,
        method: "GET",
        path: url.pathname,
        port: url.port,
      },
      (res) => {
        let buffer = ""
        res.setEncoding("utf8")
        const t = setTimeout(() => {
          req.destroy()
          reject(new Error(`SSE timeout after ${timeoutMs}ms. buffer=${JSON.stringify(buffer)}`))
        }, timeoutMs)
        res.on("data", (chunk: string) => {
          buffer += chunk
          if (until(buffer)) {
            clearTimeout(t)
            req.destroy()
            resolve({ buffer, status: res.statusCode })
          }
        })
        res.on("end", () => {
          clearTimeout(t)
          resolve({ buffer, status: res.statusCode })
        })
      },
    )
    req.on("error", (err) => {
      /** req.destroy() 呼び出しによる ECONNRESET は正常終了として無視 */
      const code = (err as NodeJS.ErrnoException).code
      if (code === "ECONNRESET" || code === "ABORT_ERR") return
      reject(err)
    })
    req.end()
  })
}

describe("GET /api/matching/events", () => {
  it("認証なし → 401", async () => {
    /** 401 ボディは即時に来てストリームは終了する */
    const res = await openSseAndCollect(
      "/api/matching/events",
      "invalid-token",
      () => true,
      2000,
    )
    expect(res.status).toBe(401)
  })

  it("publish された matched イベントを SSE で受信する", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { avatarUrl: "https://x", email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const token = generateAccessToken(me.id)

    /**
     * SSE を張ってから少し待ってから publish する（subscribe 登録待ち）。
     * `event:` と `data:` は別 chunk で届く可能性があるため、メッセージ終端 `\n\n` まで待つ。
     */
    const collectPromise = openSseAndCollect(
      "/api/matching/events",
      token,
      (buf) => buf.includes("event: matched") && buf.includes("\n\n"),
      3000,
    )
    await new Promise((r) => setTimeout(r, 200))

    await matchingEventPublisher.publishMatched([me.id], {
      livekitRoomName: "matching:42",
      peer: {
        id: peer.id,
        age: null,
        avatarUrl: peer.avatarUrl,
        bio: null,
        gender: null,
        hobbies: [],
        location: null,
        mbti: null,
        name: peer.name,
      },
      sessionId: 42,
    })

    const { buffer, status } = await collectPromise
    expect(status).toBe(200)
    expect(buffer).toContain("event: matched")
    /** wire format（snake_case）で payload が含まれること */
    expect(buffer).toContain("\"session_id\":42")
    expect(buffer).toContain("\"livekit_room_name\":\"matching:42\"")
    expect(buffer).toContain(`"id":${peer.id}`)
    /** 拡充されたプロフィール項目が含まれること */
    expect(buffer).toContain("\"hobbies\":[]")
    expect(buffer).toContain("\"gender\":null")
  })

  it("接続切断後に publish しても再受信しない（subscribe 解除）", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    /** 1 度 SSE を開いて閉じる（メッセージ終端まで待つ） */
    const first = openSseAndCollect(
      "/api/matching/events",
      token,
      (buf) => buf.includes("event: matched") && buf.includes("\n\n"),
      3000,
    )
    await new Promise((r) => setTimeout(r, 200))
    await matchingEventPublisher.publishMatched([me.id], {
      livekitRoomName: "matching:1",
      peer: {
        id: 99,
        age: null,
        avatarUrl: null,
        bio: null,
        gender: null,
        hobbies: [],
        location: null,
        mbti: null,
        name: null,
      },
      sessionId: 1,
    })
    await first

    /** subscribe 解除が完了するまで少し待つ */
    await new Promise((r) => setTimeout(r, 100))

    /** publish しても誰も受け取らない（pub の戻り値 = subscriber 数で確認） */
    const subscriberCount = await testRedis.publish(
      `matching:user:${me.id}`,
      JSON.stringify({ type: "heartbeat", ts: 0 }),
    )
    expect(subscriberCount).toBe(0)
  })
})
