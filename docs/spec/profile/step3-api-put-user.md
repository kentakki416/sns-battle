# step3-api-put-user.md

`PUT /api/users/:id` を実装する。自分のプロフィール（name / bio / avatar_url / birth_date / gender / **mbti / location / hobby_ids**）を更新する。サーバーサイドで以下のバリデーションを行う:

- パスの id は **自分の id と一致する必要がある**（他人のプロフィール更新は 403）
- birth_date 指定時は **18 歳以上 / 120 歳以下**
- 表示名は 1〜30 文字、bio は 0〜500 文字、location は 0〜100 文字
- mbti は 16 タイプの enum 値のみ
- hobby_ids は `hobby_masters` に存在する有効 id のみ

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) と [バリデーション](./README.md#バリデーション) を参照。

依存: step1（DB） / step2（GET 用 schema、`genderSchema` / `mbtiSchema` を再利用）。

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/user.ts` に追記）

```typescript
// ========================================================
// PUT /api/users/:id - プロフィール更新
// ========================================================

export const updateUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * すべて optional。指定されたフィールドのみ更新する。
 * hobby_ids は配列を渡すと、その内容で完全置換（指定外は削除）。
 * mbti を null 指定すると解除、未指定なら現状維持。
 */
export const updateUserRequestSchema = z.object({
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: genderSchema.optional(),
  hobby_ids: z.array(z.number().int().positive()).max(20).optional(),
  location: z.string().max(100).nullable().optional(),
  mbti: mbtiSchema.nullable().optional(),
  name: z.string().min(1).max(30).optional(),
})

/** レスポンスは getUserResponse と同形式 */
export const updateUserResponseSchema = getUserResponseSchema

export type UpdateUserPathParam = z.infer<typeof updateUserPathParamSchema>
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>
```

### Repository 拡張

`apps/api/src/repository/prisma/user-repository.ts`。

```typescript
export type UpdateUserInput = {
  avatarUrl?: string | null
  bio?: string | null
  birthDate?: Date
  gender?: "MALE" | "FEMALE" | "OTHER"
  /** 配列を渡すと完全置換。undefined なら現状維持 */
  hobbyIds?: number[]
  location?: string | null
  mbti?: string | null
  name?: string
}

export interface UserRepository {
  // ...既存
  update(id: number, data: UpdateUserInput): Promise<void>
}

async update(id: number, data: UpdateUserInput): Promise<void> {
  await this._prisma.$transaction(async (tx) => {
    /** users 本体の更新（指定されたフィールドのみ） */
    const userUpdateData: PrismaTypes.UserUpdateInput = {
      ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      ...(data.bio !== undefined ? { bio: data.bio } : {}),
      ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
      ...(data.gender !== undefined ? { gender: data.gender } : {}),
      ...(data.location !== undefined ? { location: data.location } : {}),
      ...(data.mbti !== undefined ? { mbti: data.mbti } : {}),
      ...(data.name !== undefined ? { name: data.name } : {}),
    }
    if (Object.keys(userUpdateData).length > 0) {
      await tx.user.update({ data: userUpdateData, where: { id } })
    }

    /** 趣味は配列指定があれば全削除→再作成で完全置換 */
    if (data.hobbyIds !== undefined) {
      await tx.userHobby.deleteMany({ where: { userId: id } })
      if (data.hobbyIds.length > 0) {
        await tx.userHobby.createMany({
          data: data.hobbyIds.map((hobbyId) => ({ hobbyId, userId: id })),
        })
      }
    }
  })
}
```

戻り値は `void` にして、Service 層で更新後のプロフィールを `findProfileById` で取り直す（趣味の関係を含めた最新状態を取得するため）。

### HobbyRepository（新規）

`apps/api/src/repository/prisma/hobby-repository.ts`（新規）。マスター取得とバリデーション用。step5 とも共有する。

```typescript
import { PrismaClient } from "../../prisma/generated/client"
import { Hobby } from "../../types/domain"

export interface HobbyRepository {
  findActiveAll(): Promise<Hobby[]>
  findActiveByIds(ids: number[]): Promise<Hobby[]>
}

export class PrismaHobbyRepository implements HobbyRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findActiveAll(): Promise<Hobby[]> {
    const rows = await this._prisma.hobbyMaster.findMany({
      orderBy: { sortOrder: "asc" },
      where: { isActive: true },
    })
    return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))
  }

  async findActiveByIds(ids: number[]): Promise<Hobby[]> {
    if (ids.length === 0) return []
    const rows = await this._prisma.hobbyMaster.findMany({
      where: { id: { in: ids }, isActive: true },
    })
    return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))
  }
}
```

`apps/api/src/repository/prisma/index.ts` から export。

### バリデーション lib

`apps/api/src/lib/age.ts` に `isValidAdultAge` 追加（step3 / step4 共通）。

```typescript
export const isValidAdultAge = (birthDate: Date, today: Date = new Date()): boolean => {
  const age = calculateAge(birthDate, today)
  if (age === null) return false
  return age >= 18 && age <= 120
}
```

### Service: `updateUserProfile`

`apps/api/src/service/user-service.ts`。

```typescript
import { calculateAge, isValidAdultAge } from "../lib/age"
import { HobbyRepository, UserRepository } from "../repository/prisma"
import { badRequestError, err, forbiddenError, notFoundError, ok, Result } from "../types/result"

export type UpdateUserProfileInput = {
  avatarUrl?: string | null
  bio?: string | null
  birthDate?: Date
  gender?: "MALE" | "FEMALE" | "OTHER"
  hobbyIds?: number[]
  location?: string | null
  mbti?: string | null
  name?: string
}

export const updateUserProfile = async (
  input: { targetUserId: number; viewerUserId: number; data: UpdateUserProfileInput },
  repo: { hobbyRepository: HobbyRepository; userRepository: UserRepository },
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId, data } = input
  logger.debug("UserService: Updating user profile", { targetUserId, viewerUserId })

  if (targetUserId !== viewerUserId) {
    return err(forbiddenError("Cannot update other user's profile"))
  }

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  /** 18 歳以上 120 歳以下 */
  if (data.birthDate !== undefined && !isValidAdultAge(data.birthDate)) {
    return err(badRequestError("Age must be between 18 and 120"))
  }

  /** hobby_ids が有効な master id のみか */
  if (data.hobbyIds !== undefined && data.hobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.hobbyIds)
    if (found.length !== data.hobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  await repo.userRepository.update(targetUserId, {
    ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
    ...(data.gender !== undefined ? { gender: data.gender } : {}),
    ...(data.hobbyIds !== undefined ? { hobbyIds: data.hobbyIds } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.mbti !== undefined ? { mbti: data.mbti } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
  })

  /** 更新後のプロフィールを再取得（趣味込み） */
  const fresh = await repo.userRepository.findProfileById(targetUserId)
  if (!fresh) {
    return err(notFoundError("User not found"))
  }

  const profile: UserProfile = {
    age: calculateAge(fresh.user.birthDate),
    avatarUrl: fresh.user.avatarUrl,
    bio: fresh.user.bio,
    birthDate: fresh.user.birthDate,
    coinBalance: fresh.user.coinBalance,
    createdAt: fresh.user.createdAt,
    gender: fresh.user.gender,
    hobbies: fresh.hobbies,
    id: fresh.user.id,
    isOnboarded: fresh.user.isOnboarded,
    isSelf: true,
    location: fresh.user.location,
    mbti: fresh.user.mbti,
    name: fresh.user.name,
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
import { HobbyRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

export class UserUpdateController {
  constructor(
    private userRepository: UserRepository,
    private hobbyRepository: HobbyRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = updateUserPathParamSchema.parse(req.params)
    const body = updateUserRequestSchema.parse(req.body)

    logger.info("UserUpdateController: Updating profile", { targetUserId: id, viewerUserId: req.userId })

    const result = await service.user.updateUserProfile(
      {
        data: {
          ...(body.avatar_url !== undefined ? { avatarUrl: body.avatar_url } : {}),
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.birth_date !== undefined ? { birthDate: new Date(body.birth_date) } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.hobby_ids !== undefined ? { hobbyIds: body.hobby_ids } : {}),
          ...(body.location !== undefined ? { location: body.location } : {}),
          ...(body.mbti !== undefined ? { mbti: body.mbti } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
        },
        targetUserId: id,
        viewerUserId: req.userId!,
      },
      { hobbyRepository: this.hobbyRepository, userRepository: this.userRepository },
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

### Router 拡張

```typescript
type UserRouterControllers = {
  get?: UserGetController
  update?: UserUpdateController
}

if (controllers.update) {
  const controller = controllers.update
  router.put("/:id", async (req, res) => controller.execute(req, res))
}
```

### DI（`apps/api/src/index.ts`）

```typescript
import { PrismaHobbyRepository } from "./repository/prisma/hobby-repository"
import { UserUpdateController } from "./controller/user/update"

const hobbyRepository = new PrismaHobbyRepository(prisma)
const userUpdateController = new UserUpdateController(userRepository, hobbyRepository)

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
1. 自分の name / bio / mbti / location 更新 → ok: true、`fresh` に反映
2. hobby_ids を渡すと完全置換、findProfileById で趣味反映確認
3. hobby_ids に存在しない id → 400 BAD_REQUEST
4. 他人の更新 → 403 FORBIDDEN
5. 存在しないユーザー → 404 NOT_FOUND
6. 18 歳ちょうど → ok（境界値）
7. 18 歳未満 → 400（境界値）
8. 121 歳 → 400（境界値）
9. birthDate 未指定 + hobby のみ更新 → ok（年齢チェックスキップ）

### Controller インテグレーションテスト

`apps/api/test/controller/user/update.test.ts`（新規）。

検証ケース:
1. 全フィールド更新（hobby_ids 含む） → 200、レスポンス完全一致、DB の `users` と `user_hobbies` の状態を `toMatchObject` で確認
2. hobby_ids 完全置換動作（既存 [1,2] → [3,4] にすると元の 1,2 が消えて 3,4 だけ残る）
3. hobby_ids 空配列 → user_hobbies 全削除
4. mbti 不正値（"AAAA"） → 400（Zod）
5. location 101 文字 → 400（Zod）
6. hobby_ids に未登録 id → 400（Service）
7. 18 歳未満 birth_date → 400（Service）
8. 他人の更新 → 403
9. 認証なし → 401

例（hobby_ids 完全置換）:

```typescript
it("hobby_ids を新配列で更新すると既存趣味は完全置換される", async () => {
  const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
  const h2 = await testPrisma.hobbyMaster.create({ data: { name: "h2", sortOrder: 2 } })
  const h3 = await testPrisma.hobbyMaster.create({ data: { name: "h3", sortOrder: 3 } })
  const me = await testPrisma.user.create({
    data: {
      birthDate: new Date("1995-01-01"),
      email: "me@example.com",
      gender: "MALE",
      hobbies: { create: [{ hobbyId: h1.id }, { hobbyId: h2.id }] },
      isOnboarded: true,
      name: "Me",
    },
  })
  const token = generateAccessToken(me.id)

  const res = await request(app)
    .put(`/api/users/${me.id}`)
    .set("Authorization", `Bearer ${token}`)
    .send({ hobby_ids: [h3.id] })

  expect(res.status).toBe(200)
  expect(res.body.hobbies).toEqual([{ id: h3.id, name: "h3" }])

  const remaining = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
  expect(remaining).toHaveLength(1)
  expect(remaining[0]).toMatchObject({ hobbyId: h3.id, userId: me.id })
})
```

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

新規 Service ユニット 9 ケース、Controller integration 9 ケースが通ること。

### dev 疎通

```bash
curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Updated","mbti":"INTJ","location":"Tokyo","hobby_ids":[1,2,3]}' \
  http://localhost:8080/api/users/<MY_USER_ID>
```

200 と更新後の JSON（hobbies / mbti / location 反映）が返ること。

## 既知の未対応 / 後続 step に持ち越し

- アバター画像のアップロード（S3 Pre-signed URL 等）は将来フェーズ
- オンボーディング完了処理は step4
- `MatchingPreference` の更新は step6
