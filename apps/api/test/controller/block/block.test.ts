import request from "supertest"

import { BlockCreateController } from "../../../src/controller/block/create"
import { BlockDeleteController } from "../../../src/controller/block/delete"
import { generateAccessToken } from "../../../src/lib/jwt"
import {
  PrismaBlockRepository,
  PrismaFollowRepository,
  PrismaTransactionRunner,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const followRepository = new PrismaFollowRepository(testPrisma)
const blockRepository = new PrismaBlockRepository(testPrisma)
const transactionRunner = new PrismaTransactionRunner(testPrisma)
const blockCreateController = new BlockCreateController(
  blockRepository,
  followRepository,
  transactionRunner,
  userRepository,
)
const blockDeleteController = new BlockDeleteController(blockRepository)

const app = createTestApp()
app.use(
  "/api/users",
  userRouter({
    blockCreate: blockCreateController,
    blockDelete: blockDeleteController,
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

describe("POST /api/users/:id/block", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).post("/api/users/1/block")
    expect(res.status).toBe(401)
  })

  it("【異常系】非数値 id → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post("/api/users/abc/block")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】自分自身 → 400 / DB に block row 作られない", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${me.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    const count = await testPrisma.block.count()
    expect(count).toBe(0)
  })

  it("【異常系】存在しないユーザー → 404", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post("/api/users/999999/block")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it("【正常系】200、DB に block row が作られる、レスポンスは blocker_id / blocked_id", async () => {
    const me = await createUser()
    const peer = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      blocked_id: peer.id,
      blocker_id: me.id,
    })
    const row = await testPrisma.block.findFirst({
      where: { blockedId: peer.id, blockerId: me.id },
    })
    expect(row).not.toBeNull()
  })

  it("【正常系】既存の双方向 follow row が両方とも削除される", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.follow.createMany({
      data: [
        { followeeId: peer.id, followerId: me.id },
        { followeeId: me.id, followerId: peer.id },
      ],
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    const remaining = await testPrisma.follow.count({
      where: {
        OR: [
          { followeeId: peer.id, followerId: me.id },
          { followeeId: me.id, followerId: peer.id },
        ],
      },
    })
    expect(remaining).toBe(0)
  })

  it("【正常系】第三者ユーザー間の follow は削除されない", async () => {
    const me = await createUser()
    const peer = await createUser()
    const other = await createUser()
    /** me と peer の follow / other 同士の follow を混在させる */
    await testPrisma.follow.createMany({
      data: [
        { followeeId: peer.id, followerId: me.id },
        { followeeId: other.id, followerId: peer.id },
      ],
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    /** me↔peer は消える、peer→other は残る */
    const meToPeer = await testPrisma.follow.count({
      where: { followeeId: peer.id, followerId: me.id },
    })
    const peerToOther = await testPrisma.follow.count({
      where: { followeeId: other.id, followerId: peer.id },
    })
    expect(meToPeer).toBe(0)
    expect(peerToOther).toBe(1)
  })

  it("【異常系】既にブロック済 → 409 / row は重複しない", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.block.create({
      data: { blockedId: peer.id, blockerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .post(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(409)
    const count = await testPrisma.block.count({
      where: { blockedId: peer.id, blockerId: me.id },
    })
    expect(count).toBe(1)
  })
})

describe("DELETE /api/users/:id/block", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).delete("/api/users/1/block")
    expect(res.status).toBe(401)
  })

  it("【異常系】自分自身 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${me.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it("【正常系】ブロック済を解除 → 200、DB から row が消える", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.block.create({
      data: { blockedId: peer.id, blockerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    const remaining = await testPrisma.block.count({
      where: { blockedId: peer.id, blockerId: me.id },
    })
    expect(remaining).toBe(0)
  })

  it("【正常系】元々ブロックしていなくても 200（冪等）", async () => {
    const me = await createUser()
    const peer = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
  })

  it("【正常系】逆方向（peer→me）のブロックは残る", async () => {
    const me = await createUser()
    const peer = await createUser()
    await testPrisma.block.createMany({
      data: [
        { blockedId: peer.id, blockerId: me.id },
        { blockedId: me.id, blockerId: peer.id },
      ],
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .delete(`/api/users/${peer.id}/block`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    const meToPeer = await testPrisma.block.count({
      where: { blockedId: peer.id, blockerId: me.id },
    })
    const peerToMe = await testPrisma.block.count({
      where: { blockedId: me.id, blockerId: peer.id },
    })
    expect(meToPeer).toBe(0)
    expect(peerToMe).toBe(1)
  })
})
