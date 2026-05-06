import request from "supertest"

import { MemoCreateController } from "../../../src/controller/memo/create"
import { PrismaMemoRepository } from "../../../src/repository/prisma/memo-repository"
import { memoRouter } from "../../../src/routes/memo-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const memoRepository = new PrismaMemoRepository(testPrisma)

const app = createTestApp()

app.use("/api/memo", memoRouter({ create: new MemoCreateController(memoRepository) }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("POST /api/memo", () => {
  it("201 と作成されたメモを返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({ body: "New Body", title: "New Title" })

    expect(res.status).toBe(201)
    expect(res.body).toEqual({
      body: "New Body",
      created_at: expect.any(String),
      id: expect.any(Number),
      title: "New Title",
      updated_at: expect.any(String),
    })

    /** DB に実際に保存されていることを確認（id/timestamp は内部詳細なので省略） */
    const memo = await testPrisma.memo.findUnique({ where: { id: res.body.id } })
    expect(memo).toMatchObject({
      body: "New Body",
      title: "New Title",
    })
  })

  it("リクエストボディが不正な場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({})

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("titleが空の場合、400 を返す", async () => {
    const res = await request(app)
      .post("/api/memo")
      .send({ body: "Body", title: "" })

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })
})
