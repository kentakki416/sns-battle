import request from "supertest"

import { MemoDetailController } from "../../../src/controller/memo/detail"
import { MemoUpdateController } from "../../../src/controller/memo/update"
import { PrismaMemoRepository } from "../../../src/repository/prisma/memo-repository"
import { memoRouter } from "../../../src/routes/memo-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const memoRepository = new PrismaMemoRepository(testPrisma)

const app = createTestApp()

app.use("/api/memo", memoRouter({
  detail: new MemoDetailController(memoRepository),
  update: new MemoUpdateController(memoRepository),
}))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("PUT /api/memo/:id", () => {
  it("200 と更新されたメモを返す", async () => {
    const memo = await testPrisma.memo.create({
      data: { body: "Old Body", title: "Old Title" },
    })

    const res = await request(app)
      .put(`/api/memo/${memo.id}`)
      .send({ body: "Updated Body", title: "Updated Title" })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      body: "Updated Body",
      created_at: expect.any(String),
      id: memo.id,
      title: "Updated Title",
      updated_at: expect.any(String),
    })

    /** DB が実際に更新されていることを確認（id/timestamp は省略） */
    const updated = await testPrisma.memo.findUnique({ where: { id: memo.id } })
    expect(updated).toMatchObject({
      body: "Updated Body",
      title: "Updated Title",
    })
  })

  it("メモが存在しない場合、404 を返す", async () => {
    const res = await request(app)
      .put("/api/memo/999999")
      .send({ body: "Updated Body", title: "Updated Title" })

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("無効なID形式の場合、400 を返す", async () => {
    const res = await request(app)
      .put("/api/memo/abc")
      .send({ body: "Updated Body", title: "Updated Title" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("リクエストボディが不正な場合、400 を返す", async () => {
    const res = await request(app)
      .put("/api/memo/1")
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })
})
