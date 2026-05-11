import request from "supertest"

import { MatchingStampsListController } from "../../../src/controller/matching/stamps-list"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaItemRepository } from "../../../src/repository/prisma/item-repository"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
} from "../setup"

const itemRepository = new PrismaItemRepository(testPrisma)
const controller = new MatchingStampsListController(itemRepository)

const app = createTestApp()
app.use("/api/matching", matchingRouter({ stampsList: controller }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
  await disconnectTestRedis()
})

/**
 * MATCHING / BATTLE / 非アクティブのスタンプを混在 seed して、MATCHING スコープのみが
 * sortOrder 昇順で返ることを assert する。
 */
const seedStamps = async () => {
  const stamps = [
    {
      animationType: "FLOAT" as const,
      emoji: "👏",
      isActive: true,
      isPremium: false,
      name: "拍手",
      scopes: ["MATCHING" as const],
      sortOrder: 1,
    },
    {
      animationType: "BOUNCE" as const,
      emoji: "✨",
      isActive: true,
      isPremium: false,
      name: "キラキラ",
      scopes: ["MATCHING" as const, "BATTLE" as const],
      sortOrder: 3,
    },
    {
      animationType: "EXPLODE" as const,
      emoji: "🔥",
      isActive: true,
      isPremium: false,
      name: "ファイア",
      scopes: ["BATTLE" as const],
      sortOrder: 10,
    },
    {
      animationType: "FLOAT" as const,
      emoji: "💎",
      isActive: true,
      isPremium: true,
      name: "ダイヤ（プレミアム）",
      scopes: ["MATCHING" as const],
      sortOrder: 5,
    },
    {
      animationType: "FLOAT" as const,
      emoji: "❌",
      isActive: false,
      isPremium: false,
      name: "非アクティブ",
      scopes: ["MATCHING" as const],
      sortOrder: 2,
    },
  ]
  for (const s of stamps) {
    const item = await testPrisma.item.create({
      data: {
        description: null,
        isActive: s.isActive,
        isPremium: s.isPremium,
        name: s.name,
        price: 0,
        sortOrder: s.sortOrder,
        type: "STAMP",
      },
    })
    await testPrisma.stampDetail.create({
      data: { animationType: s.animationType, emoji: s.emoji, itemId: item.id },
    })
    for (const scope of s.scopes) {
      await testPrisma.itemScope.create({
        data: { itemId: item.id, scope },
      })
    }
  }
}

describe("GET /api/matching/stamps", () => {
  it("【異常系】認証なし → 401", async () => {
    const res = await request(app).get("/api/matching/stamps")
    expect(res.status).toBe(401)
  })

  it("【正常系】MATCHING スコープのアクティブスタンプのみ sortOrder 昇順で返る（BATTLE 専用 / 非アクティブは除外、premium は含む）", async () => {
    const me = await testPrisma.user.create({
      data: { email: `u-${Date.now()}@example.com`, isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)
    await seedStamps()

    const res = await request(app)
      .get("/api/matching/stamps")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      stamps: [
        {
          animation_type: "FLOAT",
          emoji: "👏",
          id: expect.any(Number),
          is_premium: false,
          name: "拍手",
        },
        {
          animation_type: "BOUNCE",
          emoji: "✨",
          id: expect.any(Number),
          is_premium: false,
          name: "キラキラ",
        },
        {
          animation_type: "FLOAT",
          emoji: "💎",
          id: expect.any(Number),
          is_premium: true,
          name: "ダイヤ（プレミアム）",
        },
      ],
    })
  })

  it("【正常系】該当 0 件 → 200 / stamps: []", async () => {
    const me = await testPrisma.user.create({
      data: { email: `u-${Date.now()}@example.com`, isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/matching/stamps")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({ stamps: [] })
  })
})
