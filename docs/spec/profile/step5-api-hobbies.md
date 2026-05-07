# step5-api-hobbies.md

`GET /api/hobbies` を実装する。`hobby_masters` の有効レコード一覧を `sort_order` 昇順で返却する。フロントエンド（オンボーディング、プロフィール編集、フィルタ設定）の選択肢として使う。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) を参照。

依存: step1（`hobby_masters` テーブル + シード）。step3 で `HobbyRepository` を既に作っている前提。

## 仕様

- パスは `/api/hobbies`
- 認証: Access Token（middleware で必須）
- レスポンス: `{ hobbies: [{ id, name, sort_order }] }`
- フィルタ: `is_active=true` のみ返す
- ページネーションなし（マスター件数は将来 100 件未満想定）
- キャッシュ戦略: 将来的に `Cache-Control: public, max-age=300` を考慮（本 step では未対応）

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/hobby.ts`、新規）

```typescript
import { z } from "zod"

// ========================================================
// GET /api/hobbies - 趣味マスター一覧
// ========================================================

/**
 * 趣味マスター 1 件
 */
export const hobbyMasterSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sort_order: z.number().int(),
})

export const getHobbiesResponseSchema = z.object({
  hobbies: z.array(hobbyMasterSchema),
})

export type HobbyMaster = z.infer<typeof hobbyMasterSchema>
export type GetHobbiesResponse = z.infer<typeof getHobbiesResponseSchema>
```

`packages/schema/src/api-schema/index.ts` に追記:

```typescript
export * from "./hobby"
```

スキーマ追加後:

```bash
cd packages/schema && pnpm build
```

### Service: `getActiveHobbies`

`apps/api/src/service/hobby-service.ts`（新規）。

```typescript
import { logger } from "../log"
import { HobbyRepository } from "../repository/prisma"
import { Hobby } from "../types/domain"
import { ok, Result } from "../types/result"

export const getActiveHobbies = async (
  repo: { hobbyRepository: HobbyRepository },
): Promise<Result<Hobby[]>> => {
  logger.debug("HobbyService: Fetching active hobbies")
  const hobbies = await repo.hobbyRepository.findActiveAll()
  return ok(hobbies)
}
```

`apps/api/src/service/index.ts` にバレルエクスポート追加:

```typescript
export * as hobby from "./hobby-service"
```

### Controller

`apps/api/src/controller/hobby/list.ts`（新規）。

```typescript
import { Request, Response } from "express"

import { getHobbiesResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { HobbyRepository } from "../../repository/prisma"
import * as service from "../../service"

export class HobbyListController {
  constructor(private hobbyRepository: HobbyRepository) {}

  async execute(_req: Request, res: Response) {
    logger.info("HobbyListController: Fetching hobby list")

    const result = await service.hobby.getActiveHobbies({ hobbyRepository: this.hobbyRepository })

    /** Service は err を返さない設計だが、契約上 Result を透過 */
    if (!result.ok) {
      return res.status(result.error.statusCode).json({
        error: result.error.message,
        status_code: result.error.statusCode,
      })
    }

    const response = getHobbiesResponseSchema.parse({
      hobbies: result.value.map((h) => ({
        id: h.id,
        name: h.name,
        sort_order: h.sortOrder,
      })),
    })

    return res.status(200).json(response)
  }
}
```

### Router

`apps/api/src/routes/hobby-router.ts`（新規）。

```typescript
import { Router } from "express"

import { HobbyListController } from "../controller/hobby/list"

type HobbyRouterControllers = {
  list?: HobbyListController
}

export const hobbyRouter = (controllers: HobbyRouterControllers): Router => {
  const router = Router()

  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

### DI（`apps/api/src/index.ts`）

```typescript
import { HobbyListController } from "./controller/hobby/list"
import { hobbyRouter } from "./routes/hobby-router"

const hobbyListController = new HobbyListController(hobbyRepository)

app.use(
  "/api/hobbies",
  hobbyRouter({
    list: hobbyListController,
  })
)
```

### Service ユニットテスト

`apps/api/test/service/hobby-service/getActiveHobbies.test.ts`（新規）。

```typescript
import { HobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { getActiveHobbies } from "../../../src/service/hobby-service"
import { Hobby } from "../../../src/types/domain"

const mockFindActiveAll = jest.fn<Promise<Hobby[]>, []>()
const mockHobbyRepository: HobbyRepository = {
  findActiveAll: mockFindActiveAll,
  findActiveByIds: jest.fn(),
}

describe("getActiveHobbies", () => {
  beforeEach(() => jest.clearAllMocks())

  it("有効な趣味リストを返す", async () => {
    const hobbies: Hobby[] = [
      { id: 1, name: "音楽鑑賞", sortOrder: 1 },
      { id: 5, name: "ゲーム", sortOrder: 5 },
    ]
    mockFindActiveAll.mockResolvedValue(hobbies)

    const result = await getActiveHobbies({ hobbyRepository: mockHobbyRepository })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual(hobbies)
    expect(mockFindActiveAll).toHaveBeenCalledTimes(1)
  })

  it("マスターが空の場合、空配列を返す", async () => {
    mockFindActiveAll.mockResolvedValue([])
    const result = await getActiveHobbies({ hobbyRepository: mockHobbyRepository })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toEqual([])
  })

  it("DB エラー時は throw", async () => {
    mockFindActiveAll.mockRejectedValue(new Error("DB error"))
    await expect(getActiveHobbies({ hobbyRepository: mockHobbyRepository })).rejects.toThrow()
  })
})
```

### Controller インテグレーションテスト

`apps/api/test/controller/hobby/list.test.ts`（新規）。

```typescript
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
  it("有効な趣味マスター一覧を sort_order 昇順で返す", async () => {
    const me = await testPrisma.user.create({ data: { email: "me@example.com", name: "Me" } })
    await testPrisma.hobbyMaster.createMany({
      data: [
        { isActive: true, name: "音楽鑑賞", sortOrder: 1 },
        { isActive: true, name: "ゲーム", sortOrder: 5 },
        { isActive: false, name: "削除済", sortOrder: 99 },
      ],
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/hobbies")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      hobbies: [
        { id: expect.any(Number), name: "音楽鑑賞", sort_order: 1 },
        { id: expect.any(Number), name: "ゲーム", sort_order: 5 },
      ],
    })
    /** is_active=false の "削除済" は含まれない */
  })

  it("マスター 0 件の場合、空配列を返す", async () => {
    const me = await testPrisma.user.create({ data: { email: "me@example.com", name: "Me" } })
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
```

### setup.ts の `cleanupTestData` に `hobby_masters` / `user_hobbies` を含める

`apps/api/test/controller/setup.ts` の `cleanupTestData` で TRUNCATE 対象に追加。

```typescript
await testPrisma.userHobby.deleteMany()
await testPrisma.hobbyMaster.deleteMany()
```

`user_hobbies` は `users` の前、`hobby_masters` は `users` 削除と前後関係に注意（FK 順）。実装時に既存 cleanup ロジックの位置に合わせて追加する。

## 動作確認

### スキーマ + ビルド

```bash
cd packages/schema && pnpm build
cd ../../apps/api && pnpm build
```

### テスト実行

```bash
cd apps/api && pnpm test
```

新規 Service ユニット 3 ケース、Controller integration 3 ケースが通ること。

### dev 疎通

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8080/api/hobbies
```

シードで投入された 20 件の `{ id, name, sort_order }` が `sort_order` 昇順で返ること。

## 既知の未対応 / 後続 step に持ち越し

- HTTP キャッシュ（`Cache-Control: public, max-age=300`）は将来対応
- Admin の hobby_masters 管理画面は将来フェーズ
- フロントエンドのキャッシュ戦略（SWR、React cache 等）は step7 / step9 / step10 の実装時に検討
