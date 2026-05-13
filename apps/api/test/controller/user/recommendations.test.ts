import request from "supertest"

import { UserRecommendationsController } from "../../../src/controller/user/recommendations"
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
const blockRepository = new PrismaBlockRepository(testPrisma)
const followRepository = new PrismaFollowRepository(testPrisma)
const userRecommendationsController = new UserRecommendationsController(
  blockRepository,
  followRepository,
  userRepository,
)

const app = createTestApp()
app.use(
  "/api/users",
  userRouter({
    recommendations: userRecommendationsController,
  }),
)
attachErrorHandler(app)

let counter = 0
const createUser = async (overrides?: { isOnboarded?: boolean; name?: string }) => {
  counter += 1
  return testPrisma.user.create({
    data: {
      email: `u-${Date.now()}-${counter}@example.com`,
      isOnboarded: overrides?.isOnboarded ?? true,
      name: overrides?.name ?? `User ${counter}`,
    },
  })
}

beforeEach(async () => {
  await cleanupTestData()
  counter = 0
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("GET /api/users/recommendations", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/users/recommendations")
    expect(res.status).toBe(401)
  })

  it("【異常系】limit が範囲外 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .query({ limit: 0 })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【正常系】候補なし → users: []", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ users: [] })
  })

  it("【正常系】フォロワー数降順で返す（同数は id 昇順）", async () => {
    const me = await createUser({ name: "Me" })
    const popular = await createUser({ name: "Popular" })
    const middle = await createUser({ name: "Middle" })
    const newcomerA = await createUser({ name: "Newcomer A" })
    const newcomerB = await createUser({ name: "Newcomer B" })
    /** popular に 3 フォロワー（newcomerA / newcomerB / middle）、middle に 1（popular）、newcomerA/B は 0 */
    await testPrisma.follow.createMany({
      data: [
        { followeeId: popular.id, followerId: newcomerA.id },
        { followeeId: popular.id, followerId: newcomerB.id },
        { followeeId: popular.id, followerId: middle.id },
        { followeeId: middle.id, followerId: popular.id },
      ],
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      users: [
        { avatar_url: null, bio: null, follower_count: 3, id: popular.id, name: "Popular" },
        { avatar_url: null, bio: null, follower_count: 1, id: middle.id, name: "Middle" },
        { avatar_url: null, bio: null, follower_count: 0, id: newcomerA.id, name: "Newcomer A" },
        { avatar_url: null, bio: null, follower_count: 0, id: newcomerB.id, name: "Newcomer B" },
      ],
    })
  })

  it("【正常系】自分自身は結果に含まれない", async () => {
    const me = await createUser({ name: "Self" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users.map((u: { id: number }) => u.id)).not.toContain(me.id)
  })

  it("【正常系】既にフォロー済みのユーザーは結果から除外する", async () => {
    const me = await createUser()
    const followed = await createUser({ name: "Followed" })
    const stranger = await createUser({ name: "Stranger" })
    await testPrisma.follow.create({
      data: { followeeId: followed.id, followerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users.map((u: { id: number }) => u.id)).toEqual([stranger.id])
  })

  it("【正常系】自分→相手 のブロックは結果から除外する", async () => {
    const me = await createUser()
    const blocked = await createUser({ name: "Blocked" })
    const visible = await createUser({ name: "Visible" })
    await testPrisma.block.create({
      data: { blockedId: blocked.id, blockerId: me.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users.map((u: { id: number }) => u.id)).toEqual([visible.id])
  })

  it("【正常系】相手→自分 のブロックも結果から除外する（双方向）", async () => {
    const me = await createUser()
    const blocker = await createUser({ name: "Blocker" })
    const visible = await createUser({ name: "Visible" })
    await testPrisma.block.create({
      data: { blockedId: me.id, blockerId: blocker.id },
    })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users.map((u: { id: number }) => u.id)).toEqual([visible.id])
  })

  it("【正常系】オンボーディング未完了のユーザーは結果から除外する", async () => {
    const me = await createUser()
    const unfinished = await createUser({ isOnboarded: false, name: "Unfinished" })
    const visible = await createUser({ name: "Visible" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    const ids = res.body.users.map((u: { id: number }) => u.id)
    expect(ids).toContain(visible.id)
    expect(ids).not.toContain(unfinished.id)
  })

  it("【正常系】limit を上限として件数を絞る", async () => {
    const me = await createUser()
    for (let i = 0; i < 5; i += 1) {
      await createUser({ name: `Candidate ${i}` })
    }
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/recommendations")
      .query({ limit: 3 })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users).toHaveLength(3)
  })
})
