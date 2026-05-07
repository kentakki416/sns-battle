# step4-api-onboarding.md

`PUT /api/users/:id/onboarding` を実装する。**初回ログイン後の必須プロフィール設定**を一括登録し、`is_onboarded=true` に変更する。既に `is_onboarded=true` のユーザーは 409 Conflict を返す。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) を参照。

依存: step1（DB） / step2 / step3（共通スキーマ・Service ヘルパー・年齢計算・趣味バリデーション）。

## 仕様

- 入力（**必須**）: `name`, `birth_date`, `gender`
- 入力（**任意**）: `bio`, `mbti`, `location`, `hobby_ids` — オンボーディング時に未入力でも OK（あとで `/profile/edit` から設定可能）
- 自分の id しか実行できない（403）
- `is_onboarded=true` のユーザーが再呼び出しすると 409 Conflict
- 18 歳以上 / 120 歳以下バリデーション（step3 と同じ `isValidAdultAge` 流用）
- hobby_ids が指定された場合は `hobby_masters` に存在する有効 id のみ（step3 と同じ）
- 成功時は `is_onboarded=true` にして更新後のプロフィール（趣味込み）を返却

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/user.ts` に追記）

```typescript
// ========================================================
// PUT /api/users/:id/onboarding - オンボーディング完了
// ========================================================

export const completeOnboardingPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 初回プロフィール設定。name / birth_date / gender 必須。bio / mbti / location / hobby_ids 任意。
 */
export const completeOnboardingRequestSchema = z.object({
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: genderSchema,
  hobby_ids: z.array(z.number().int().positive()).max(20).optional(),
  location: z.string().max(100).nullable().optional(),
  mbti: mbtiSchema.nullable().optional(),
  name: z.string().min(1).max(30),
})

export const completeOnboardingResponseSchema = getUserResponseSchema

export type CompleteOnboardingPathParam = z.infer<typeof completeOnboardingPathParamSchema>
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>
export type CompleteOnboardingResponse = z.infer<typeof completeOnboardingResponseSchema>
```

### Repository に `completeOnboarding` 追加

`apps/api/src/repository/prisma/user-repository.ts`。トランザクション内で users 更新 + user_hobbies 作成を一気に行う。

```typescript
export type CompleteOnboardingInput = {
  bio: string | null
  birthDate: Date
  gender: "MALE" | "FEMALE" | "OTHER"
  hobbyIds: number[]
  location: string | null
  mbti: string | null
  name: string
}

export interface UserRepository {
  // ...既存
  completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<void>
}

async completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<void> {
  await this._prisma.$transaction(async (tx) => {
    await tx.user.update({
      data: {
        bio: data.bio,
        birthDate: data.birthDate,
        gender: data.gender,
        isOnboarded: true,
        location: data.location,
        mbti: data.mbti,
        name: data.name,
      },
      where: { id },
    })
    /** 趣味は新規ユーザー想定だが、念のため一旦削除して入れ直し */
    await tx.userHobby.deleteMany({ where: { userId: id } })
    if (data.hobbyIds.length > 0) {
      await tx.userHobby.createMany({
        data: data.hobbyIds.map((hobbyId) => ({ hobbyId, userId: id })),
      })
    }
  })
}
```

`completeOnboarding` の戻り値は void。Service 側で `findProfileById` を呼んで最新状態（hobbies 含む）を取得する。

### Service: `completeOnboarding`

`apps/api/src/service/user-service.ts`。

```typescript
import { calculateAge, isValidAdultAge } from "../lib/age"
import { HobbyRepository, UserRepository } from "../repository/prisma"
import { badRequestError, conflictError, err, forbiddenError, notFoundError, ok, Result } from "../types/result"

export type CompleteOnboardingServiceInput = {
  bio: string | null
  birthDate: Date
  gender: "MALE" | "FEMALE" | "OTHER"
  hobbyIds: number[]
  location: string | null
  mbti: string | null
  name: string
}

export const completeOnboarding = async (
  input: { targetUserId: number; viewerUserId: number; data: CompleteOnboardingServiceInput },
  repo: { hobbyRepository: HobbyRepository; userRepository: UserRepository },
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId, data } = input
  logger.debug("UserService: Completing onboarding", { targetUserId, viewerUserId })

  if (targetUserId !== viewerUserId) {
    return err(forbiddenError("Cannot complete onboarding for other user"))
  }

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  if (user.isOnboarded) {
    return err(conflictError("Onboarding already completed"))
  }

  if (!isValidAdultAge(data.birthDate)) {
    return err(badRequestError("Age must be between 18 and 120"))
  }

  if (data.hobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.hobbyIds)
    if (found.length !== data.hobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  await repo.userRepository.completeOnboarding(targetUserId, {
    bio: data.bio,
    birthDate: data.birthDate,
    gender: data.gender,
    hobbyIds: data.hobbyIds,
    location: data.location,
    mbti: data.mbti,
    name: data.name,
  })

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

### Controller

`apps/api/src/controller/user/onboarding.ts`（新規）。

```typescript
import { Response } from "express"

import {
  completeOnboardingPathParamSchema,
  completeOnboardingRequestSchema,
  completeOnboardingResponseSchema,
  ErrorResponse,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { HobbyRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

export class UserOnboardingController {
  constructor(
    private userRepository: UserRepository,
    private hobbyRepository: HobbyRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = completeOnboardingPathParamSchema.parse(req.params)
    const body = completeOnboardingRequestSchema.parse(req.body)

    logger.info("UserOnboardingController: Completing onboarding", { targetUserId: id, viewerUserId: req.userId })

    const result = await service.user.completeOnboarding(
      {
        data: {
          bio: body.bio ?? null,
          birthDate: new Date(body.birth_date),
          gender: body.gender,
          hobbyIds: body.hobby_ids ?? [],
          location: body.location ?? null,
          mbti: body.mbti ?? null,
          name: body.name,
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

    const response = completeOnboardingResponseSchema.parse({
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
  onboarding?: UserOnboardingController
  update?: UserUpdateController
}

if (controllers.onboarding) {
  const controller = controllers.onboarding
  router.put("/:id/onboarding", async (req, res) => controller.execute(req, res))
}
```

`PUT /api/users/:id/onboarding` の方を `PUT /api/users/:id` より先に登録すると Express がパスを正しくマッチする。明示的に長いパスを先に書くのが安全。

### DI（`apps/api/src/index.ts`）

```typescript
import { UserOnboardingController } from "./controller/user/onboarding"

const userOnboardingController = new UserOnboardingController(userRepository, hobbyRepository)

app.use(
  "/api/users",
  userRouter({
    get: userGetController,
    onboarding: userOnboardingController,
    update: userUpdateController,
  })
)
```

### Service ユニットテスト

`apps/api/test/service/user-service/completeOnboarding.test.ts`（新規）。

検証ケース:
1. 必須項目のみで完了（bio / mbti / location / hobby_ids 全て省略） → ok: true、isOnboarded=true、UserProfile 全フィールド検証（mbti / location は null、hobbies は []）
2. 全項目指定で完了 → ok、hobbies に趣味反映
3. 既に is_onboarded=true → 409 CONFLICT
4. 他人の id を指定 → 403 FORBIDDEN
5. 存在しないユーザー → 404 NOT_FOUND
6. 18 歳未満 → 400 BAD_REQUEST（境界値）
7. 18 歳ちょうど → ok（境界値）
8. hobby_ids に存在しない id → 400 BAD_REQUEST

### Controller インテグレーションテスト

`apps/api/test/controller/user/onboarding.test.ts`（新規）。

検証ケース:
1. 必須項目のみで成功 → 200、レスポンス完全一致、DB の `is_onboarded=true / birth_date / gender / name` を `toMatchObject` で確認、user_hobbies は 0 件
2. 全項目指定（hobby_ids 含む）で成功 → 200、user_hobbies に 3 件作成
3. 既に完了済 → 409
4. 他人の id → 403
5. birth_date フォーマット不正 → 400（Zod）
6. gender 不正値 → 400（Zod）
7. mbti 不正値（"AAAA"） → 400（Zod）
8. name 31 文字 → 400（Zod）
9. 18 歳未満 → 400（Service）
10. hobby_ids に未登録 id → 400（Service）
11. 認証なし → 401

例（成功 + hobbies）:

```typescript
it("全項目指定で is_onboarded=true + hobbies が DB に保存される", async () => {
  const h1 = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
  const h2 = await testPrisma.hobbyMaster.create({ data: { name: "h2", sortOrder: 2 } })
  const me = await testPrisma.user.create({
    data: { email: "me@example.com", isOnboarded: false, name: null },
  })
  const token = generateAccessToken(me.id)

  const res = await request(app)
    .put(`/api/users/${me.id}/onboarding`)
    .set("Authorization", `Bearer ${token}`)
    .send({
      bio: "hello",
      birth_date: "1995-05-15",
      gender: "MALE",
      hobby_ids: [h1.id, h2.id],
      location: "Tokyo",
      mbti: "INTJ",
      name: "Alice",
    })

  expect(res.status).toBe(200)
  expect(res.body).toEqual({
    age: expect.any(Number),
    avatar_url: null,
    bio: "hello",
    birth_date: "1995-05-15",
    coin_balance: 0,
    created_at: expect.any(String),
    gender: "MALE",
    hobbies: [
      { id: h1.id, name: "h1" },
      { id: h2.id, name: "h2" },
    ],
    id: me.id,
    is_onboarded: true,
    is_self: true,
    location: "Tokyo",
    mbti: "INTJ",
    name: "Alice",
  })

  const updated = await testPrisma.user.findUnique({ where: { id: me.id } })
  expect(updated).toMatchObject({
    bio: "hello",
    gender: "MALE",
    isOnboarded: true,
    location: "Tokyo",
    mbti: "INTJ",
    name: "Alice",
  })

  const hobbies = await testPrisma.userHobby.findMany({ where: { userId: me.id } })
  expect(hobbies).toHaveLength(2)
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

新規 Service ユニット 8 ケース、Controller integration 11 ケースが通ること。

### dev 疎通

```bash
# 1. 新規ユーザーで Google サインイン → is_onboarded=false 状態にする
# 2. /api/auth/me で id と is_onboarded を確認

# 必須のみ
curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"NewUser","birth_date":"1995-05-15","gender":"MALE"}' \
  http://localhost:8080/api/users/<MY_USER_ID>/onboarding

# 全項目
curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"NewUser","birth_date":"1995-05-15","gender":"MALE","mbti":"INTJ","location":"Tokyo","hobby_ids":[1,2,3]}' \
  http://localhost:8080/api/users/<MY_USER_ID>/onboarding

# 200 + is_onboarded:true。同じリクエストの再送は 409。
```

## 既知の未対応 / 後続 step に持ち越し

- アバター画像のアップロードは将来フェーズ。Google アカウントの値を流用
- 「自分以外の id を渡されたとき」を 403 で扱う実装。middleware で自動的に `:id = req.userId` に強制する設計に将来変える可能性あり
- `MatchingPreference` の初期化はこの API では行わない（step6 で初回 PUT 時に upsert）
