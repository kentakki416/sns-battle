# step3-api-put-user.md

`PUT /api/users/:id` を実装する。自分のプロフィール（name / bio / avatar_url / birth_date / gender）を更新する。サーバーサイドで以下のバリデーションを行う:

- パスの id は **自分の id と一致する必要がある**（他人のプロフィール更新は 403）
- birth_date 指定時は **18 歳以上 / 120 歳以下**
- 表示名は 1〜30 文字、bio は 0〜500 文字

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) と [バリデーション](./README.md#バリデーション) を参照。

依存: step1（DB） / step2（GET 用 schema、`genderSchema` を再利用）。

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/user.ts` に追記）

```typescript
// ========================================================
// PUT /api/users/:id - プロフィール更新
// ========================================================

/**
 * パスパラメータ: id
 */
export const updateUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * リクエストボディ。すべて optional。指定されたフィールドのみ更新する。
 * birth_date は ISO 日付文字列 (YYYY-MM-DD)。
 */
export const updateUserRequestSchema = z.object({
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: genderSchema.optional(),
  name: z.string().min(1).max(30).optional(),
})

/**
 * レスポンス: 更新後の getUserResponse と同じ形式
 */
export const updateUserResponseSchema = getUserResponseSchema

export type UpdateUserPathParam = z.infer<typeof updateUserPathParamSchema>
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>
```

### Repository に `update` 追加

`apps/api/src/repository/prisma/user-repository.ts` に `UpdateUserInput` 型と `update` メソッドを追加。

```typescript
export type UpdateUserInput = {
  avatarUrl?: string | null
  bio?: string | null
  birthDate?: Date
  gender?: "MALE" | "FEMALE" | "OTHER"
  name?: string
}

export interface UserRepository {
  create(data: CreateUserInput): Promise<User>
  findByEmail(email: string): Promise<User | null>
  findById(id: number): Promise<User | null>
  update(id: number, data: UpdateUserInput): Promise<User>
}

// PrismaUserRepository に実装追加
async update(id: number, data: UpdateUserInput): Promise<User> {
  const prismaUser = await this._prisma.user.update({
    data: {
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    },
    where: { id },
  })
  return this._toDomainUser(prismaUser)
}
```

### Service: バリデーションヘルパー

`apps/api/src/lib/age.ts` に追加。

```typescript
/**
 * 年齢が 18 歳以上 120 歳以下か検証する。
 */
export const isValidAdultAge = (birthDate: Date, today: Date = new Date()): boolean => {
  const age = calculateAge(birthDate, today)
  if (age === null) return false
  return age >= 18 && age <= 120
}
```

### Service: `updateUserProfile`

`apps/api/src/service/user-service.ts` に追加。

```typescript
import { calculateAge, isValidAdultAge } from "../lib/age"
import { badRequestError, err, forbiddenError, notFoundError, ok, Result } from "../types/result"

import { UpdateUserInput } from "../repository/prisma/user-repository"

export type UpdateUserProfileInput = {
  avatarUrl?: string | null
  bio?: string | null
  birthDate?: Date
  gender?: "MALE" | "FEMALE" | "OTHER"
  name?: string
}

export const updateUserProfile = async (
  input: { targetUserId: number; viewerUserId: number; data: UpdateUserProfileInput },
  repo: { userRepository: UserRepository },
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId, data } = input
  logger.debug("UserService: Updating user profile", { targetUserId, viewerUserId })

  // 自分のプロフィールしか更新できない
  if (targetUserId !== viewerUserId) {
    return err(forbiddenError("Cannot update other user's profile"))
  }

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  // 18 歳以上 120 歳以下のチェック
  if (data.birthDate !== undefined && !isValidAdultAge(data.birthDate)) {
    return err(badRequestError("Age must be between 18 and 120"))
  }

  const updateInput: UpdateUserInput = {
    ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
    ...(data.gender !== undefined ? { gender: data.gender } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
  }

  const updated = await repo.userRepository.update(targetUserId, updateInput)

  const profile: UserProfile = {
    age: calculateAge(updated.birthDate),
    avatarUrl: updated.avatarUrl,
    bio: updated.bio,
    birthDate: updated.birthDate,
    coinBalance: updated.coinBalance,
    createdAt: updated.createdAt,
    gender: updated.gender,
    id: updated.id,
    isOnboarded: updated.isOnboarded,
    isSelf: true,
    location: updated.location,
    mbti: updated.mbti,
    name: updated.name,
  }
  return ok(profile)
}
```

### `forbiddenError` ヘルパー

`apps/api/src/types/result.ts` に未定義なら追加。

```typescript
export const forbiddenError = (message: string): ApiError => ({
  message,
  statusCode: 403,
  type: "FORBIDDEN",
})
```

### Controller

`apps/api/src/controller/user/update.ts`（新規）。

```typescript
import { Response } from "express"

import {
  ErrorResponse,
  updateUserPathParamSchema,
  updateUserRequestSchema,
  updateUserResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

export class UserUpdateController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = updateUserPathParamSchema.parse(req.params)
    const body = updateUserRequestSchema.parse(req.body)

    logger.info("UserUpdateController: Updating profile", { targetUserId: id, viewerUserId: req.userId })

    const result = await service.user.updateUserProfile(
      {
        data: {
          avatarUrl: body.avatar_url,
          bio: body.bio,
          birthDate: body.birth_date ? new Date(body.birth_date) : undefined,
          gender: body.gender,
          name: body.name,
        },
        targetUserId: id,
        viewerUserId: req.userId!,
      },
      { userRepository: this.userRepository },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = updateUserResponseSchema.parse({
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

### Router 拡張

`apps/api/src/routes/user-router.ts` に `update` 追加。

```typescript
type UserRouterControllers = {
  get?: UserGetController
  update?: UserUpdateController
}

export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  if (controllers.get) {
    const controller = controllers.get
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }
  if (controllers.update) {
    const controller = controllers.update
    router.put("/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

### DI（`apps/api/src/index.ts`）

```typescript
import { UserUpdateController } from "./controller/user/update"

const userUpdateController = new UserUpdateController(userRepository)

app.use(
  "/api/users",
  userRouter({
    get: userGetController,
    update: userUpdateController,
  })
)
```

### Service ユニットテスト

`apps/api/test/service/user-service/updateUserProfile.test.ts`（新規）。

検証ケース:
1. 自分の更新 → ok: true、更新フィールドが反映、isSelf=true
2. 他人の更新 → 403 FORBIDDEN
3. 存在しないユーザー → 404 NOT_FOUND
4. 18 歳未満の birthDate → 400 BAD_REQUEST（境界値: 17 歳 364 日）
5. 18 歳ちょうど → ok: true（境界値: 18 歳 0 日）
6. 120 歳超えの birthDate → 400 BAD_REQUEST（境界値: 121 歳）
7. birthDate 未指定の更新 → ok: true（年齢チェックスキップ）

```typescript
import { UserRepository } from "../../../src/repository/prisma/user-repository"
import { updateUserProfile } from "../../../src/service/user-service"
import { User } from "../../../src/types/domain"

const mockFindById = jest.fn<Promise<User | null>, [number]>()
const mockUpdate = jest.fn<Promise<User>, [number, any]>()
const mockUserRepository: UserRepository = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: mockFindById,
  update: mockUpdate,
}

const baseUser: User = {
  avatarUrl: null,
  bio: null,
  birthDate: new Date("1995-01-01"),
  coinBalance: 0,
  createdAt: new Date(),
  email: "u@example.com",
  gender: "MALE",
  id: 1,
  isOnboarded: true,
  location: null,
  mbti: null,
  name: "Alice",
  updatedAt: new Date(),
}

describe("updateUserProfile", () => {
  beforeEach(() => jest.clearAllMocks())

  it("自分のプロフィール更新は ok: true で更新後を返す", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockUpdate.mockResolvedValue({ ...baseUser, name: "Updated" })

    const result = await updateUserProfile(
      { data: { name: "Updated" }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({ isSelf: true, name: "Updated" })
    }
  })

  it("他人のプロフィール更新は 403 FORBIDDEN", async () => {
    const result = await updateUserProfile(
      { data: { name: "X" }, targetUserId: 2, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 403, type: "FORBIDDEN" })
    }
  })

  it("18 歳未満の birthDate は 400 BAD_REQUEST", async () => {
    mockFindById.mockResolvedValue(baseUser)
    /** 今日から 17 年前 + 364 日（18 歳になる前日）にする */
    const today = new Date()
    const young = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate() + 1)

    const result = await updateUserProfile(
      { data: { birthDate: young }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400, type: "BAD_REQUEST" })
    }
  })

  it("18 歳ちょうどは ok: true（境界値）", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockUpdate.mockResolvedValue(baseUser)
    const today = new Date()
    const exactly18 = new Date(today.getFullYear() - 18, today.getMonth(), today.getDate())

    const result = await updateUserProfile(
      { data: { birthDate: exactly18 }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
  })

  it("121 歳は 400 BAD_REQUEST（境界値）", async () => {
    mockFindById.mockResolvedValue(baseUser)
    const today = new Date()
    const tooOld = new Date(today.getFullYear() - 121, today.getMonth(), today.getDate())

    const result = await updateUserProfile(
      { data: { birthDate: tooOld }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 400 })
    }
  })

  it("birthDate 未指定の更新は年齢チェックをスキップ", async () => {
    mockFindById.mockResolvedValue(baseUser)
    mockUpdate.mockResolvedValue({ ...baseUser, bio: "hello" })

    const result = await updateUserProfile(
      { data: { bio: "hello" }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.bio).toBe("hello")
    }
  })

  it("ユーザーが存在しない場合は 404 NOT_FOUND", async () => {
    mockFindById.mockResolvedValue(null)

    const result = await updateUserProfile(
      { data: { name: "X" }, targetUserId: 1, viewerUserId: 1 },
      { userRepository: mockUserRepository },
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({ statusCode: 404, type: "NOT_FOUND" })
    }
  })
})
```

### Controller インテグレーションテスト

`apps/api/test/controller/user/update.test.ts`（新規）。

検証ケース（HTTP レイヤー）:
1. 自分の更新 → 200、レスポンス全フィールド検証、DB の最終状態を `toMatchObject` で確認
2. 他人の更新 → 403
3. 不正な birth_date（フォーマット） → 400（Zod レベル）
4. 18 歳未満の birth_date → 400（Service レベル）
5. 表示名 0 文字 → 400（Zod の min(1)）
6. 表示名 31 文字 → 400（Zod の max(30)）
7. 認証なし → 401

既存の `auth/me.test.ts` のセットアップを参考に書く。

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

新規 Service ユニットテスト 7 ケース、Controller インテグレーションテスト 7 ケースが全て通ること。

### dev で疎通

```bash
curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated","bio":"hello","birth_date":"1995-05-15","gender":"MALE"}' \
  http://localhost:8080/api/users/<MY_USER_ID>
```

200 と更新後の JSON が返ること。

## 既知の未対応 / 後続 step に持ち越し

- アバター画像のアップロード（S3 Pre-signed URL 等）は将来フェーズ。本 step は URL 文字列の更新のみ
- オンボーディング完了処理は本 API には含まない（step4 で別 API として実装。`is_onboarded` フラグの更新を行う）
- `MatchingPreference` の更新は将来フェーズ
