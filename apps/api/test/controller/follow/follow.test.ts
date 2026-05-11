import request from "supertest"

import { FollowCreateController } from "../../../src/controller/follow/create"
import { FollowDeleteController } from "../../../src/controller/follow/delete"
import { generateAccessToken } from "../../../src/lib/jwt"
import {
  PrismaBlockRepository,
  PrismaFollowRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const followRepository = new PrismaFollowRepository(testPrisma)
const blockRepository = new PrismaBlockRepository(testPrisma)
const followCreateController = new FollowCreateController(
  blockRepository,
  followRepository,
  userRepository,
)
const followDeleteController = new FollowDeleteController(followRepository)

const app = createTestApp()
app.use(
  "/api/users",
  userRouter({
    followCreate: followCreateController,
    followDelete: followDeleteController,
  }),
)
attachErrorHandler(app)

const createUser = async (overrides?: { email?: string; name?: string }) =>
  testPrisma.user.create({
    data: {
      email: overrides?.email ?? `u-${Date.now()}-${Math.random()}@example.com`,
      isOnboarded: true,
      name: overrides?.name ?? "User",
    },
  })

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/users/:id/follow", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).post("/api/users/1/follow")
    expect(res.status).toBe(401)
  })

  it("【異常系】非数値 id → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post("/api/users/abc/follow")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】自分自身 → 400 / DB に follow row 作られない", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${me.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    const count = await testPrisma.follow.count()
    expect(count).toBe(0)
  })

  it("【異常系】存在しないユーザー → 404", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post("/api/users/999999/follow")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it("【異常系】ブロック関係あり → 400", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.block.create({
      data: { blockedId: peer.id, blockerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    const count = await testPrisma.follow.count()
    expect(count).toBe(0)
  })

  it("【正常系】正常系 → 200、DB に follow row が作られる、レスポンスは follower_id / followee_id", async () => {
    const me = await createUser()
    const peer = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      followee_id: peer.id,
      follower_id: me.id,
    })
    const row = await testPrisma.follow.findFirst({
      where: { followeeId: peer.id, followerId: me.id },
    })
    expect(row).not.toBeNull()
  })

  it("【異常系】既にフォロー済 → 409 / row は重複しない", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.follow.create({
      data: { followeeId: peer.id, followerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(409)
    const count = await testPrisma.follow.count({
      where: { followeeId: peer.id, followerId: me.id },
    })
    expect(count).toBe(1)
  })
})

describe("DELETE /api/users/:id/follow", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).delete("/api/users/1/follow")
    expect(res.status).toBe(401)
  })

  it("【異常系】自分自身 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${me.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it("【正常系】正常系（フォロー済を解除） → 200、DB から row が消える", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.follow.create({
      data: { followeeId: peer.id, followerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${peer.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    const remaining = await testPrisma.follow.count({
      where: { followeeId: peer.id, followerId: me.id },
    })
    expect(remaining).toBe(0)
  })

  it("【正常系】元々フォローしていなくても 200（冪等）", async () => {
    const me = await createUser()
    const peer = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${peer.id}/follow`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
  })
})
