import request from "supertest"

import { FollowersListController } from "../../../src/controller/follow/followers"
import { FollowingListController } from "../../../src/controller/follow/following"
import { generateAccessToken } from "../../../src/lib/jwt"
import {
  PrismaFollowRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const followRepository = new PrismaFollowRepository(testPrisma)
const followersListController = new FollowersListController(followRepository, userRepository)
const followingListController = new FollowingListController(followRepository, userRepository)

const app = createTestApp()
app.use(
  "/api/users",
  userRouter({
    followersList: followersListController,
    followingList: followingListController,
  }),
)
attachErrorHandler(app)

let counter = 0
const createUser = async (overrides?: { bio?: string | null; name?: string }) => {
  counter += 1
  return testPrisma.user.create({
    data: {
      bio: overrides?.bio ?? null,
      email: `u-${Date.now()}-${counter}@example.com`,
      isOnboarded: true,
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

describe("GET /api/users/:id/followers", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/users/1/followers")
    expect(res.status).toBe(401)
  })

  it("【異常系】非数値 id → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/abc/followers")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】存在しないユーザー → 404", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/999999/followers")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it("【正常系】フォロワー 0 件 → users: []、next_cursor: null", async () => {
    const me = await createUser()
    const target = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ next_cursor: null, users: [] })
  })

  it("【正常系】フォロワー一覧を follow.id 降順で返す", async () => {
    const me = await createUser()
    const target = await createUser()
    const followerA = await createUser({ bio: "bio A", name: "Alice" })
    const followerB = await createUser({ bio: "bio B", name: "Bob" })
    /** A → target、B → target の順で row を作成。id は B の方が大きいので先頭に来る */
    await testPrisma.follow.create({ data: { followeeId: target.id, followerId: followerA.id } })
    await testPrisma.follow.create({ data: { followeeId: target.id, followerId: followerB.id } })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      next_cursor: null,
      users: [
        { avatar_url: null, bio: "bio B", id: followerB.id, name: "Bob" },
        { avatar_url: null, bio: "bio A", id: followerA.id, name: "Alice" },
      ],
    })
  })

  it("【正常系】limit ぴったりで next_cursor が返る、cursor 指定で次ページが取れる", async () => {
    const me = await createUser()
    const target = await createUser()
    const f1 = await createUser({ name: "f1" })
    const f2 = await createUser({ name: "f2" })
    const f3 = await createUser({ name: "f3" })
    const r1 = await testPrisma.follow.create({ data: { followeeId: target.id, followerId: f1.id } })
    const r2 = await testPrisma.follow.create({ data: { followeeId: target.id, followerId: f2.id } })
    const r3 = await testPrisma.follow.create({ data: { followeeId: target.id, followerId: f3.id } })
    const token = generateAccessToken(me.id)

    /** 1 ページ目: limit=2 → f3, f2 が返り next_cursor=r2.id */
    const page1 = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .query({ limit: 2 })
      .set("Authorization", `Bearer ${token}`)
    expect(page1.status).toBe(200)
    expect(page1.body).toEqual({
      next_cursor: r2.id,
      users: [
        { avatar_url: null, bio: null, id: f3.id, name: "f3" },
        { avatar_url: null, bio: null, id: f2.id, name: "f2" },
      ],
    })

    /** 2 ページ目: cursor=r2.id → f1 だけ。1 件しか無いので next_cursor=null */
    const page2 = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .query({ cursor: r2.id, limit: 2 })
      .set("Authorization", `Bearer ${token}`)
    expect(page2.status).toBe(200)
    expect(page2.body).toEqual({
      next_cursor: null,
      users: [{ avatar_url: null, bio: null, id: f1.id, name: "f1" }],
    })
    /** r3 / r1 が未使用警告にならないように */
    expect(r1.id).toBeDefined()
    expect(r3.id).toBeDefined()
  })

  it("【異常系】limit が範囲外 → 400", async () => {
    const me = await createUser()
    const target = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .query({ limit: 0 })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
  })
})

describe("GET /api/users/:id/following", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/users/1/following")
    expect(res.status).toBe(401)
  })

  it("【異常系】存在しないユーザー → 404", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/999999/following")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(404)
  })

  it("【正常系】フォロー中一覧を follow.id 降順で返す", async () => {
    const me = await createUser()
    const target = await createUser()
    const followeeA = await createUser({ name: "Alice" })
    const followeeB = await createUser({ name: "Bob" })
    await testPrisma.follow.create({ data: { followeeId: followeeA.id, followerId: target.id } })
    await testPrisma.follow.create({ data: { followeeId: followeeB.id, followerId: target.id } })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get(`/api/users/${target.id}/following`)
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      next_cursor: null,
      users: [
        { avatar_url: null, bio: null, id: followeeB.id, name: "Bob" },
        { avatar_url: null, bio: null, id: followeeA.id, name: "Alice" },
      ],
    })
  })

  it("【正常系】対象が他人をフォローしていても、対称の followers 側には混在しない", async () => {
    const me = await createUser()
    const target = await createUser()
    const other = await createUser({ name: "Other" })
    /** target が other をフォローしている（following に Other が出る）、other → target はフォローしていない */
    await testPrisma.follow.create({ data: { followeeId: other.id, followerId: target.id } })
    const token = generateAccessToken(me.id)

    const followingRes = await request(app)
      .get(`/api/users/${target.id}/following`)
      .set("Authorization", `Bearer ${token}`)
    expect(followingRes.status).toBe(200)
    expect(followingRes.body.users).toEqual([
      { avatar_url: null, bio: null, id: other.id, name: "Other" },
    ])

    const followersRes = await request(app)
      .get(`/api/users/${target.id}/followers`)
      .set("Authorization", `Bearer ${token}`)
    expect(followersRes.status).toBe(200)
    expect(followersRes.body.users).toEqual([])
  })
})
