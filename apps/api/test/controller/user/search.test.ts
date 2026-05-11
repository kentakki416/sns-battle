import request from "supertest"

import { UserSearchController } from "../../../src/controller/user/search"
import { generateAccessToken } from "../../../src/lib/jwt"
import {
  PrismaBlockRepository,
  PrismaUserRepository,
} from "../../../src/repository/prisma"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, disconnectTestRedis, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const blockRepository = new PrismaBlockRepository(testPrisma)
const userSearchController = new UserSearchController(blockRepository, userRepository)

const app = createTestApp()
app.use(
  "/api/users",
  userRouter({
    search: userSearchController,
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

describe("GET /api/users/search", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/users/search").query({ q: "alice" })
    expect(res.status).toBe(401)
  })

  it("【異常系】q 未指定 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("【異常系】q が空文字 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it("【異常系】limit が範囲外 → 400", async () => {
    const me = await createUser()
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ limit: 0, q: "a" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(400)
  })

  it("【正常系】ヒットなし → users: []、next_cursor: null", async () => {
    const me = await createUser({ name: "Zachary" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "no-such-name" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ next_cursor: null, users: [] })
  })

  it("【正常系】部分一致を user.id 降順で返す", async () => {
    const me = await createUser()
    const alice = await createUser({ bio: "bio A", name: "Alice" })
    const alicia = await createUser({ bio: "bio B", name: "Alicia" })
    const bob = await createUser({ name: "Bob" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "Ali" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      next_cursor: null,
      /** id 降順なので Alicia (後に作った方) が先頭 */
      users: [
        { avatar_url: null, bio: "bio B", id: alicia.id, name: "Alicia" },
        { avatar_url: null, bio: "bio A", id: alice.id, name: "Alice" },
      ],
    })
    /** bob は検索条件に含まれないことを確認するための作成。未使用警告回避 */
    expect(bob.id).toBeDefined()
  })

  it("【正常系】case-insensitive で一致する", async () => {
    const me = await createUser()
    const target = await createUser({ name: "AliceUpper" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "aliceupper" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([
      { avatar_url: null, bio: null, id: target.id, name: "AliceUpper" },
    ])
  })

  it("【正常系】自分→相手 のブロックは結果から除外する", async () => {
    const me = await createUser()
    const blocked = await createUser({ name: "Alice Blocked" })
    const visible = await createUser({ name: "Alice Visible" })
    await testPrisma.block.create({ data: { blockedId: blocked.id, blockerId: me.id } })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "Alice" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([
      { avatar_url: null, bio: null, id: visible.id, name: "Alice Visible" },
    ])
  })

  it("【正常系】相手→自分 のブロックも結果から除外する（双方向）", async () => {
    const me = await createUser()
    const blocker = await createUser({ name: "Alice Blocker" })
    await testPrisma.block.create({ data: { blockedId: me.id, blockerId: blocker.id } })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "Alice" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([])
  })

  it("【正常系】limit ぴったりで next_cursor が返り、cursor 指定で次ページが取れる", async () => {
    const me = await createUser()
    const u1 = await createUser({ name: "Alice 1" })
    const u2 = await createUser({ name: "Alice 2" })
    const u3 = await createUser({ name: "Alice 3" })
    const token = generateAccessToken(me.id)

    /** 1 ページ目: limit=2 → u3, u2 が返り next_cursor=u2.id */
    const page1 = await request(app)
      .get("/api/users/search")
      .query({ limit: 2, q: "Alice" })
      .set("Authorization", `Bearer ${token}`)
    expect(page1.status).toBe(200)
    expect(page1.body).toEqual({
      next_cursor: u2.id,
      users: [
        { avatar_url: null, bio: null, id: u3.id, name: "Alice 3" },
        { avatar_url: null, bio: null, id: u2.id, name: "Alice 2" },
      ],
    })

    /** 2 ページ目: cursor=u2.id → u1 だけ。1 件しか無いので next_cursor=null */
    const page2 = await request(app)
      .get("/api/users/search")
      .query({ cursor: u2.id, limit: 2, q: "Alice" })
      .set("Authorization", `Bearer ${token}`)
    expect(page2.status).toBe(200)
    expect(page2.body).toEqual({
      next_cursor: null,
      users: [{ avatar_url: null, bio: null, id: u1.id, name: "Alice 1" }],
    })
  })

  it("【正常系】自分も検索結果に含まれる（spec: 自分を除外しない）", async () => {
    const me = await createUser({ name: "Self User" })
    const token = generateAccessToken(me.id)
    const res = await request(app)
      .get("/api/users/search")
      .query({ q: "Self" })
      .set("Authorization", `Bearer ${token}`)
    expect(res.status).toBe(200)
    expect(res.body.users).toEqual([
      { avatar_url: null, bio: null, id: me.id, name: "Self User" },
    ])
  })
})
