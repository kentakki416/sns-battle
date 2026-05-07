# step2-api-get-user.md

`GET /api/users/:id` を実装する。指定ユーザーのプロフィール情報を返却する。`birth_date` から年齢を計算してレスポンスに含め、自分の id を取得した場合のみ生年月日等のプライバシー情報も返す。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) と [プロフィール公開範囲](./README.md#プロフィール公開範囲) を参照。

依存: step1（Prisma スキーマ拡張）が完了していること。

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/user.ts`）

既存の `getUserRequestSchema` / `getUserResponseSchema` は memo の雛形なので **置き換える**。

```typescript
import { z } from "zod"

// ========================================================
// GET /api/users/:id - ユーザープロフィール取得
// ========================================================

/**
 * 共通の Gender enum
 */
export const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"])
export type Gender = z.infer<typeof genderSchema>

/**
 * パスパラメータ: id (数値)
 */
export const getUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * レスポンス。is_self=true のときだけ birth_date, mbti, location, coin_balance を返す
 */
export const getUserResponseSchema = z.object({
  age: z.number().int().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  /** 自分のプロフィール取得時のみ ISO 日付文字列、他人取得時は null */
  birth_date: z.string().nullable(),
  /** 自分のプロフィール取得時のみ数値、他人取得時は null */
  coin_balance: z.number().int().nullable(),
  created_at: z.string(),
  gender: genderSchema.nullable(),
  id: z.number().int(),
  is_onboarded: z.boolean(),
  /** 自分のプロフィール取得時 true */
  is_self: z.boolean(),
  /** 自分のプロフィール取得時のみ、他人取得時は null */
  location: z.string().nullable(),
  /** 自分のプロフィール取得時のみ、他人取得時は null（将来は表示可否を別ルールで管理） */
  mbti: z.string().nullable(),
  name: z.string().nullable(),
})

export type GetUserPathParam = z.infer<typeof getUserPathParamSchema>
export type GetUserResponse = z.infer<typeof getUserResponseSchema>
```

memo 雛形時代の既存 `getUserRequestSchema` を export している箇所（grep で確認）から削除しても影響無いことを確認すること。

### `packages/schema/src/api-schema/index.ts`

既に `export * from "./user"` 済みなので変更不要。スキーマ追加後は必ず:

```bash
cd packages/schema && pnpm build
```

### Domain ロジック: 年齢計算

`apps/api/src/lib/age.ts`（新規）。Service / 他で再利用するため lib に切り出す。

```typescript
/**
 * 生年月日から満年齢を計算する。
 * 誕生日前なら -1 する正確な日付比較を行う。
 * birthDate が null の場合は null を返す。
 */
export const calculateAge = (birthDate: Date | null, today: Date = new Date()): number | null => {
  if (!birthDate) return null
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}
```

### Service の拡張

`apps/api/src/service/user-service.ts` に `getUserProfile` を追加。`getUserById` は既存のままにし、ID 取得用途で残す。

```typescript
import { logger } from "../log"
import { UserRepository } from "../repository/prisma"
import { User } from "../types/domain"
import { err, notFoundError, ok, Result } from "../types/result"
import { calculateAge } from "../lib/age"

export type UserProfile = {
  age: number | null
  avatarUrl: string | null
  bio: string | null
  birthDate: Date | null
  coinBalance: number | null
  createdAt: Date
  gender: User["gender"]
  id: number
  isOnboarded: boolean
  isSelf: boolean
  location: string | null
  mbti: string | null
  name: string | null
}

/**
 * 指定ユーザーのプロフィールを取得。
 * isSelf=true（自分のプロフィール取得時）はプライバシー情報も含めて返却する。
 * isSelf=false の場合、birthDate / mbti / location / coinBalance は null マスクして返す。
 */
export const getUserProfile = async (
  input: { targetUserId: number; viewerUserId: number },
  repo: { userRepository: UserRepository }
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId } = input
  logger.debug("UserService: Fetching user profile", { targetUserId, viewerUserId })

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  const isSelf = user.id === viewerUserId
  const profile: UserProfile = {
    age: calculateAge(user.birthDate),
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthDate: isSelf ? user.birthDate : null,
    coinBalance: isSelf ? user.coinBalance : null,
    createdAt: user.createdAt,
    gender: user.gender,
    id: user.id,
    isOnboarded: user.isOnboarded,
    isSelf,
    location: isSelf ? user.location : null,
    mbti: isSelf ? user.mbti : null,
    name: user.name,
  }
  return ok(profile)
}
```

### Controller

`apps/api/src/controller/user/get.ts`（新規）。

```typescript
import { Response } from "express"

import { ErrorResponse, getUserPathParamSchema, getUserResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

export class UserGetController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = getUserPathParamSchema.parse(req.params)

    logger.info("UserGetController: Fetching user profile", { targetUserId: id, viewerUserId: req.userId })

    const result = await service.user.getUserProfile(
      { targetUserId: id, viewerUserId: req.userId! },
      { userRepository: this.userRepository },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getUserResponseSchema.parse({
      age: result.value.age,
      avatar_url: result.value.avatarUrl,
      bio: result.value.bio,
      birth_date: result.value.birthDate ? result.value.birthDate.toISOString().slice(0, 10) : null,
      coin_balance: result.value.coinBalance,
      created_at: result.value.createdAt.toISOString(),
      gender: result.value.gender,
      id: result.value.id,
      is_onboarded: result.value.isOnboarded,
      is_self: result.value.isSelf,
      location: result.value.location,
      mbti: result.value.mbti,
      name: result.value.name,
    })

    return res.status(200).json(response)
  }
}
```

### Router

`apps/api/src/routes/user-router.ts`（新規）。

```typescript
import { Router } from "express"

import { UserGetController } from "../controller/user/get"

type UserRouterControllers = {
  get?: UserGetController
}

export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  if (controllers.get) {
    const controller = controllers.get
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

### DI（`apps/api/src/index.ts`）

```typescript
import { UserGetController } from "./controller/user/get"
import { userRouter } from "./routes/user-router"

const userGetController = new UserGetController(userRepository)

app.use(
  "/api/users",
  userRouter({
    get: userGetController,
  })
)
```

### Service ユニットテスト

`apps/api/test/service/user-service/getUserProfile.test.ts`（新規）。

```typescript
import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { getUserProfile } from "../../../src/service/user-service"
import { User } from "../../../src/types/domain"

const mockFindById = jest.fn<Promise<User | null>, [number]>()
const mockUserRepository: UserRepository = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: mockFindById,
}

const baseUser: User = {
  avatarUrl: null,
  bio: null,
  birthDate: new Date("1995-05-15"),
  coinBalance: 100,
  createdAt: new Date(),
  email: "u@example.com",
  gender: "MALE",
  id: 1,
  isOnboarded: true,
  location: "Tokyo",
  mbti: "INTJ",
  name: "Alice",
  updatedAt: new Date(),
}

describe("getUserProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("自分のプロフィール取得時 isSelf=true で全情報を返す", async () => {
    mockFindById.mockResolvedValue(baseUser)

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: baseUser.birthDate,
        coinBalance: 100,
        isSelf: true,
        location: "Tokyo",
        mbti: "INTJ",
      })
      expect(result.value.age).toBeGreaterThanOrEqual(18)
    }
  })

  it("他人のプロフィール取得時 isSelf=false でプライバシー情報を null マスクする", async () => {
    mockFindById.mockResolvedValue(baseUser)

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 99 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: null,
        coinBalance: null,
        gender: "MALE", // gender は他人にも公開
        isSelf: false,
        location: null,
        mbti: null,
      })
      expect(result.value.age).toBeGreaterThanOrEqual(18)
    }
  })

  it("ユーザーが存在しない場合、404 NOT_FOUND を返す", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await getUserProfile(
      { targetUserId: 999, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
  })

  it("birth_date が null の場合、age=null を返す", async () => {
    mockFindById.mockResolvedValue({ ...baseUser, birthDate: null })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.age).toBeNull()
    }
  })
})
```

### Controller インテグレーションテスト

`apps/api/test/controller/user/get.test.ts`（新規）。実 DB を使う。

```typescript
import request from "supertest"

import { UserGetController } from "../../../src/controller/user/get"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaUserRepository } from "../../../src/repository/prisma/user-repository"
import { userRouter } from "../../../src/routes/user-router"
import { attachErrorHandler, createTestApp } from "../helper"
import { cleanupTestData, disconnectTestDb, testPrisma } from "../setup"

const userRepository = new PrismaUserRepository(testPrisma)
const userGetController = new UserGetController(userRepository)

const app = createTestApp()
app.use("/api/users", userRouter({ get: userGetController }))
attachErrorHandler(app)

beforeEach(async () => {
  await cleanupTestData()
})

afterAll(async () => {
  await cleanupTestData()
  await disconnectTestDb()
})

describe("GET /api/users/:id", () => {
  it("自分の id を取得すると is_self=true で全情報が返る", async () => {
    const me = await testPrisma.user.create({
      data: {
        birthDate: new Date("1995-05-15"),
        coinBalance: 100,
        email: "me@example.com",
        gender: "MALE",
        isOnboarded: true,
        location: "Tokyo",
        mbti: "INTJ",
        name: "Me",
      },
    })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/users/${me.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: null,
      birth_date: "1995-05-15",
      coin_balance: 100,
      created_at: expect.any(String),
      gender: "MALE",
      id: me.id,
      is_onboarded: true,
      is_self: true,
      location: "Tokyo",
      mbti: "INTJ",
      name: "Me",
    })
  })

  it("他人の id を取得すると is_self=false でプライバシー情報が null になる", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const other = await testPrisma.user.create({
      data: {
        birthDate: new Date("1990-01-01"),
        coinBalance: 9999,
        email: "other@example.com",
        gender: "FEMALE",
        isOnboarded: true,
        location: "Osaka",
        mbti: "ENFP",
        name: "Other",
      },
    })

    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/users/${other.id}`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      age: expect.any(Number),
      avatar_url: null,
      bio: null,
      birth_date: null,
      coin_balance: null,
      created_at: expect.any(String),
      gender: "FEMALE",
      id: other.id,
      is_onboarded: true,
      is_self: false,
      location: null,
      mbti: null,
      name: "Other",
    })
  })

  it("存在しない id の場合 404 を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/users/9999999")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("不正な id の場合 400 を返す", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/users/abc")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(400)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 400 })
  })

  it("認証なしの場合 401 を返す", async () => {
    const res = await request(app).get("/api/users/1")

    expect(res.status).toBe(401)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 401 })
  })
})
```

## 動作確認

### スキーマビルド

```bash
cd packages/schema && pnpm build
```

### API ビルド

```bash
cd apps/api && pnpm build
```

### テスト実行

```bash
cd apps/api && pnpm test
```

新規 Service ユニットテスト（4 ケース）と Controller インテグレーションテスト（5 ケース）が全て通ること。

### dev サーバーで疎通確認

```bash
cd apps/api && pnpm dev
```

別ターミナルから（access token は dev 環境で実際にサインインして取得）:

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8080/api/users/1
```

`is_self / age / birth_date` 等のフィールドを含む JSON が返ること。

## 既知の未対応 / 後続 step に持ち越し

- 18 歳未満チェックは取得 API では行わない（更新 API（step3 / step4）で実施）
- フォロワー数 / フォロー中数 / `is_followed_by_me` / `is_live` 等の関係性フィールドは Phase 5（social）で `getUserResponseSchema` に追加する
- `MatchingPreference` の取得は将来フェーズ
