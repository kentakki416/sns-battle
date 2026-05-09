import request from "supertest"

import { MemoDetailController } from "../../../src/controller/memo/detail"
import { PrismaMemoRepository } from "../../../src/repository/prisma/memo-repository"
import { memoRouter } from "../../../src/routes/memo-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const memoRepository = new PrismaMemoRepository(testPrisma)

const app = createTestApp()

app.use("/api/memo", memoRouter({ detail: new MemoDetailController(memoRepository) }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/memo/:id", () => {
  it("200 とメモ詳細を返す", async () => {
    const memo = await testPrisma.memo.create({
      data: { body: "Test Body", title: "Test Title" },
    })

    const res = await request(app).get(`/api/memo/${memo.id}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      body: "Test Body",
      created_at: expect.any(String),
      id: memo.id,
      title: "Test Title",
      updated_at: expect.any(String),
    })
  })

  it("メモが存在しない場合、404 を返す", async () => {
    const res = await request(app).get("/api/memo/999999")

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("無効なID形式の場合、400 を返す", async () => {
    const res = await request(app).get("/api/memo/abc")

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })
})
