# step2-api-get-user.md

`GET /api/users/:id` を実装する。指定ユーザーのプロフィール情報（年齢計算済 / 趣味 / MBTI / 居住地域含む）を返却する。`is_self` フラグでプライバシー情報の出し分けを行う。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) と [プロフィール公開範囲](./README.md#プロフィール公開範囲) を参照。

依存: step1（Prisma スキーマ拡張、`hobby_masters` / `user_hobbies` テーブル含む）。

## 公開範囲のポリシー

| フィールド | 自分（is_self=true） | 他人（is_self=false） |
|----------|--------------------|-----------------------|
| name / avatar_url / bio / created_at / is_onboarded | 公開 | 公開 |
| age（birth_date から計算） | 公開 | 公開 |
| gender | 公開 | 公開 |
| **mbti** | 公開 | **公開**（マッチング相手も使うため公開する。表示可否は UI 側で制御） |
| **location** | 公開 | **公開**（同上） |
| **hobbies** | 公開 | **公開**（同上） |
| **birth_date** | 公開 | **null マスク** |
| **coin_balance** | 公開 | **null マスク** |
| **is_self** | 常に true | 常に false |

`mbti` / `location` / `hobbies` は **マッチング時の相性表示にも使う** ため他人にも公開する（README.md の「プロフィール公開範囲」セクションも合わせて更新済み）。`birth_date` は年齢があれば足りるためマスク。

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/user.ts`）

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
 * 共通の MBTI enum（16 タイプ）
 */
export const mbtiSchema = z.enum([
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
])
export type MbtiType = z.infer<typeof mbtiSchema>

/**
 * 趣味エントリ（プロフィールレスポンスに埋め込む形）
 */
export const hobbySchema = z.object({
  id: z.number().int(),
  name: z.string(),
})
export type Hobby = z.infer<typeof hobbySchema>

export const getUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * レスポンス。birth_date / coin_balance のみ is_self=true 時に値を返し、他人取得時は null。
 * mbti / location / hobbies は他人にも公開する（マッチング時の相性表示用）。
 */
export const getUserResponseSchema = z.object({
  age: z.number().int().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  /** is_self=true 時のみ ISO 日付文字列、他人取得時は null */
  birth_date: z.string().nullable(),
  /** is_self=true 時のみ数値、他人取得時は null */
  coin_balance: z.number().int().nullable(),
  created_at: z.string(),
  gender: genderSchema.nullable(),
  /** 趣味は他人にも公開（hobby_master との JOIN 結果） */
  hobbies: z.array(hobbySchema),
  id: z.number().int(),
  is_onboarded: z.boolean(),
  is_self: z.boolean(),
  /** 居住地域は他人にも公開 */
  location: z.string().nullable(),
  /** MBTI は他人にも公開 */
  mbti: mbtiSchema.nullable(),
  name: z.string().nullable(),
})

export type GetUserPathParam = z.infer<typeof getUserPathParamSchema>
export type GetUserResponse = z.infer<typeof getUserResponseSchema>
```

memo 雛形時代の既存 `getUserRequestSchema` / `getUserResponseSchema` は **置き換える**。grep で参照箇所を確認して影響無いことを確認すること。

スキーマ追加後:

```bash
cd packages/schema && pnpm build
```

### 年齢計算 lib

`apps/api/src/lib/age.ts`（新規）。step3 / step4 でも使う。

```typescript
/**
 * 生年月日から満年齢を計算する。誕生日前なら -1。birthDate が null なら null。
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

### Repository: 趣味も含めて取得する

`UserRepository` の interface に「趣味込み」のメソッドを追加。既存 `findById` は `User` のみ返す。趣味込みは別メソッド `findProfileById` として分離する（責務を明確に）。

```typescript
import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { Hobby, User } from "../../types/domain"

export type UserProfileWithHobbies = {
  hobbies: Hobby[]
  user: User
}

export interface UserRepository {
  create(data: CreateUserInput): Promise<User>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
  findProfileById(id: number): Promise<UserProfileWithHobbies | null>
}

// PrismaUserRepository 実装
async findProfileById(id: number): Promise<UserProfileWithHobbies | null> {
  const prismaUser = await this._prisma.user.findUnique({
    include: {
      hobbies: {
        include: { hobby: true },
        orderBy: { hobby: { sortOrder: "asc" } },
      },
    },
    where: { id },
  })
  if (!prismaUser) return null
  return {
    hobbies: prismaUser.hobbies.map((uh) => ({
      id: uh.hobby.id,
      name: uh.hobby.name,
      sortOrder: uh.hobby.sortOrder,
    })),
    user: this._toDomainUser(prismaUser),
  }
}
```

### Service: `getUserProfile`

`apps/api/src/service/user-service.ts`。既存 `getUserById` は ID 取得用途で残す。趣味込みのプロフィール取得は新規 `getUserProfile`。

```typescript
import { calculateAge } from "../lib/age"
import { Hobby, User } from "../types/domain"
import { err, notFoundError, ok, Result } from "../types/result"
import { UserRepository } from "../repository/prisma"

export type UserProfile = {
  age: number | null
  avatarUrl: string | null
  bio: string | null
  birthDate: Date | null
  coinBalance: number | null
  createdAt: Date
  gender: User["gender"]
  hobbies: Hobby[]
  id: number
  isOnboarded: boolean
  isSelf: boolean
  location: string | null
  mbti: string | null
  name: string | null
}

export const getUserProfile = async (
  input: { targetUserId: number; viewerUserId: number },
  repo: { userRepository: UserRepository },
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId } = input
  logger.debug("UserService: Fetching user profile", { targetUserId, viewerUserId })

  const found = await repo.userRepository.findProfileById(targetUserId)
  if (!found) {
    return err(notFoundError("User not found"))
  }

  const { hobbies, user } = found
  const isSelf = user.id === viewerUserId

  const profile: UserProfile = {
    age: calculateAge(user.birthDate),
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthDate: isSelf ? user.birthDate : null,
    coinBalance: isSelf ? user.coinBalance : null,
    createdAt: user.createdAt,
    gender: user.gender,
    hobbies,
    id: user.id,
    isOnboarded: user.isOnboarded,
    isSelf,
    location: user.location,
    mbti: user.mbti,
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
      hobbies: result.value.hobbies.map((h) => ({ id: h.id, name: h.name })),
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

検証ケース:
1. 自分のプロフィール取得時、birth_date / coin_balance も値が返る
2. 他人のプロフィール取得時、birth_date / coin_balance は null マスク。mbti / location / hobbies は値あり
3. 趣味が複数登録されている場合、`Hobby[]` で sortOrder 昇順に返る
4. ユーザー存在しない場合、404 NOT_FOUND
5. birth_date が null の場合、age=null
6. mbti / location が null の場合、レスポンスでも null

```typescript
import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { getUserProfile } from "../../../src/service/user-service"
import { Hobby, User } from "../../../src/types/domain"

const mockFindProfileById = jest.fn<Promise<{ hobbies: Hobby[]; user: User } | null>, [number]>()
const mockUserRepository: UserRepository = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
  findProfileById: mockFindProfileById,
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

const baseHobbies: Hobby[] = [
  { id: 1, name: "音楽鑑賞", sortOrder: 1 },
  { id: 5, name: "ゲーム", sortOrder: 5 },
]

describe("getUserProfile", () => {
  beforeEach(() => jest.clearAllMocks())

  it("自分のプロフィール取得時 isSelf=true で全情報を返す", async () => {
    mockFindProfileById.mockResolvedValue({ hobbies: baseHobbies, user: baseUser })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: baseUser.birthDate,
        coinBalance: 100,
        hobbies: baseHobbies,
        isSelf: true,
        location: "Tokyo",
        mbti: "INTJ",
      })
    }
  })

  it("他人のプロフィール取得時 isSelf=false で birth_date / coin_balance のみ null マスク", async () => {
    mockFindProfileById.mockResolvedValue({ hobbies: baseHobbies, user: baseUser })

    const result = await getUserProfile(
      { targetUserId: 1, viewerUserId: 99 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        birthDate: null,
        coinBalance: null,
        gender: "MALE",
        hobbies: baseHobbies,
        isSelf: false,
        location: "Tokyo",
        mbti: "INTJ",
      })
    }
  })

  it("ユーザーが存在しない場合、404 NOT_FOUND", async () => {
    mockFindProfileById.mockResolvedValue(null)

    const result = await getUserProfile(
      { targetUserId: 999, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
  })

  it("birth_date が null の場合、age=null", async () => {
    mockFindProfileById.mockResolvedValue({
      hobbies: [],
      user: { ...baseUser, birthDate: null },
    })

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

`apps/api/test/controller/user/get.test.ts`（新規）。実 DB を使い、`testPrisma` で hobby_masters / user_hobbies を直接書く。

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
  it("自分の id を取得すると is_self=true で全情報 + 趣味配列が返る", async () => {
    const hobby1 = await testPrisma.hobbyMaster.create({
      data: { name: "音楽鑑賞", sortOrder: 1 },
    })
    const hobby2 = await testPrisma.hobbyMaster.create({
      data: { name: "ゲーム", sortOrder: 5 },
    })
    const me = await testPrisma.user.create({
      data: {
        birthDate: new Date("1995-05-15"),
        coinBalance: 100,
        email: "me@example.com",
        gender: "MALE",
        hobbies: {
          create: [{ hobbyId: hobby1.id }, { hobbyId: hobby2.id }],
        },
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
      hobbies: [
        { id: hobby1.id, name: "音楽鑑賞" },
        { id: hobby2.id, name: "ゲーム" },
      ],
      id: me.id,
      is_onboarded: true,
      is_self: true,
      location: "Tokyo",
      mbti: "INTJ",
      name: "Me",
    })
  })

  it("他人の id を取得すると is_self=false で birth_date / coin_balance のみ null マスク。趣味は公開", async () => {
    const hobby = await testPrisma.hobbyMaster.create({
      data: { name: "ヨガ", sortOrder: 12 },
    })
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const other = await testPrisma.user.create({
      data: {
        birthDate: new Date("1990-01-01"),
        coinBalance: 9999,
        email: "other@example.com",
        gender: "FEMALE",
        hobbies: { create: [{ hobbyId: hobby.id }] },
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
      hobbies: [{ id: hobby.id, name: "ヨガ" }],
      id: other.id,
      is_onboarded: true,
      is_self: false,
      location: "Osaka",
      mbti: "ENFP",
      name: "Other",
    })
  })

  it("存在しない id の場合 404 を返す", async () => {
    const me = await testPrisma.user.create({ data: { email: "me@example.com", name: "Me" } })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get("/api/users/9999999")
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(404)
    expect(res.body).toEqual({ error: expect.any(String), status_code: 404 })
  })

  it("不正な id の場合 400 を返す", async () => {
    const me = await testPrisma.user.create({ data: { email: "me@example.com", name: "Me" } })
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

### スキーマ + API ビルド

```bash
cd packages/schema && pnpm build
cd ../../apps/api && pnpm build
```

### テスト実行

```bash
cd apps/api && pnpm test
```

新規 Service ユニット 5 ケース、Controller integration 5 ケースが通ること。

### dev で疎通

```bash
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8080/api/users/1
```

`hobbies / mbti / location / is_self / age / birth_date` 等のフィールドを含む JSON が返ること。

## 既知の未対応 / 後続 step に持ち越し

- 18 歳バリデーションは更新 API（step3 / step4）で実施
- フォロワー数 / フォロー中数 / `is_followed_by_me` / `is_live` は Phase 5（social）で追加
- `MatchingPreference` の取得 API は step6
