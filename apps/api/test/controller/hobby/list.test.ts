import request from "supertest"

import { HobbyListController } from "../../../src/controller/hobby/list"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaHobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { hobbyRouter } from "../../../src/routes/hobby-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const hobbyRepository = new PrismaHobbyRepository(testPrisma)
const hobbyListController = new HobbyListController(hobbyRepository)

const app = createTestApp()
app.use("/api/hobbies", hobbyRouter({ list: hobbyListController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("GET /api/hobbies", () => {
  it("有効な趣味マスター一覧を sort_order 昇順で返し、is_active=false は含まれない", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const music = await testPrisma.hobbyMaster.create({
      data: { isActive: true, name: "音楽鑑賞", sortOrder: 1 },
    })
    const game = await testPrisma.hobbyMaster.create({
      data: { isActive: true, name: "ゲーム", sortOrder: 5 },
    })
    await testPrisma.hobbyMaster.create({
      data: { isActive: false, name: "削除済", sortOrder: 99 },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/hobbies")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      hobbies: [
        { id: music.id, name: "音楽鑑賞", sort_order: 1 },
        { id: game.id, name: "ゲーム", sort_order: 5 },
      ],
    })
  })

  it("マスター 0 件の場合、空配列を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/hobbies")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hobbies: [] })
  })

  it("認証なしの場合 401 を返す", async () => {
    const res = await request(app).get("/api/hobbies")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
