# step4-api-onboarding.md

`PUT /api/users/:id/onboarding` を実装する。**初回ログイン後の必須プロフィール設定**を一括登録し、`is_onboarded=true` に変更する。既に `is_onboarded=true` のユーザーは 409 Conflict を返す。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) を参照。

依存: step1（DB） / step2 / step3（共通スキーマ・Service ヘルパー・年齢計算）。

## 対応内容

### 仕様

- 入力（必須）: `name`, `birth_date`, `gender`
- 入力（任意）: `bio`
- 自分の id しか実行できない（403）
- `is_onboarded=true` のユーザーが再呼び出しすると 409 Conflict
- 18 歳以上 / 120 歳以下バリデーション（step3 と同じ `isValidAdultAge` 流用）
- 成功時は `is_onboarded=true` にして更新後のプロフィールを返却

### スキーマ定義（`packages/schema/src/api-schema/user.ts` に追記）

```typescript
// ========================================================
// PUT /api/users/:id/onboarding - オンボーディング完了
// ========================================================

export const completeOnboardingPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 初回プロフィール設定。name / birth_date / gender 必須、bio 任意。
 */
export const completeOnboardingRequestSchema = z.object({
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: genderSchema,
  name: z.string().min(1).max(30),
})

export const completeOnboardingResponseSchema = getUserResponseSchema

export type CompleteOnboardingPathParam = z.infer<typeof completeOnboardingPathParamSchema>
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>
export type CompleteOnboardingResponse = z.infer<typeof completeOnboardingResponseSchema>
```

### Repository に `completeOnboarding` 追加

`apps/api/src/repository/prisma/user-repository.ts`。`update` と分けて専用メソッドを切る（is_onboarded フラグの一斉更新と他フィールドの整合性を Repository 層で保証）。

```typescript
export type CompleteOnboardingInput = {
  bio: string | null
  birthDate: Date
  gender: "MALE" | "FEMALE" | "OTHER"
  name: string
}

export interface UserRepository {
  // ...既存
  completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<User>
}

// PrismaUserRepository に実装追加
async completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<User> {
  const prismaUser = await this._prisma.user.update({
    data: {
      bio: data.bio,
      birthDate: data.birthDate,
      gender: data.gender,
      isOnboarded: true,
      name: data.name,
    },
    where: { id },
  })
  return this._toDomainUser(prismaUser)
}
```

### Service: `completeOnboarding`

`apps/api/src/service/user-service.ts` に追加。

```typescript
import { conflictError } from "../types/result"

export type CompleteOnboardingServiceInput = {
  bio: string | null
  birthDate: Date
  gender: "MALE" | "FEMALE" | "OTHER"
  name: string
}

export const completeOnboarding = async (
  input: { targetUserId: number; viewerUserId: number; data: CompleteOnboardingServiceInput },
  repo: { userRepository: UserRepository },
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

  const updated = await repo.userRepository.completeOnboarding(targetUserId, {
    bio: data.bio,
    birthDate: data.birthDate,
    gender: data.gender,
    name: data.name,
  })

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
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

export class UserOnboardingController {
  constructor(private userRepository: UserRepository) {}

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

    const response = completeOnboardingResponseSchema.parse({
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

`apps/api/src/routes/user-router.ts` に `onboarding` 追加。

```typescript
type UserRouterControllers = {
  get?: UserGetController
  onboarding?: UserOnboardingController
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
  if (controllers.onboarding) {
    const controller = controllers.onboarding
    router.put("/:id/onboarding", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

`PUT /api/users/:id/onboarding` の方を `PUT /api/users/:id` より先に登録すると Express がパスを正しくマッチする（Express 4 系は順序通りにマッチング）。後ろに登録しても `:id/onboarding` がフルパス一致でマッチするため動作するが、明示的に長いパスを先に書くのが安全。

### DI（`apps/api/src/index.ts`）

```typescript
import { UserOnboardingController } from "./controller/user/onboarding"

const userOnboardingController = new UserOnboardingController(userRepository)

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
1. 未オンボーディングユーザーの完了 → ok: true、isOnboarded=true、UserProfile 全フィールド検証
2. 既に is_onboarded=true → 409 CONFLICT
3. 他人の id を指定 → 403 FORBIDDEN
4. 存在しないユーザー → 404 NOT_FOUND
5. 18 歳未満 → 400 BAD_REQUEST（境界値）
6. bio 省略 → ok: true（bio は任意）

### Controller インテグレーションテスト

`apps/api/test/controller/user/onboarding.test.ts`（新規）。

検証ケース:
1. 成功 → 200、レスポンス完全一致、DB の `is_onboarded=true / birth_date / gender / name / bio` を `toMatchObject` で確認
2. 既に完了済 → 409
3. 他人の id → 403
4. birth_date フォーマット不正 → 400（Zod）
5. gender 不正値 → 400（Zod）
6. name 31 文字 → 400（Zod）
7. 18 歳未満 → 400（Service）
8. 認証なし → 401

例（成功ケース）:

```typescript
it("オンボーディング未完了ユーザーは 200 で is_onboarded=true になる", async () => {
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
    id: me.id,
    is_onboarded: true,
    is_self: true,
    location: null,
    mbti: null,
    name: "Alice",
  })

  const updated = await testPrisma.user.findUnique({ where: { id: me.id } })
  expect(updated).toMatchObject({
    bio: "hello",
    gender: "MALE",
    isOnboarded: true,
    name: "Alice",
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

新規 Service ユニットテスト 6 ケース、Controller インテグレーションテスト 8 ケースが全て通ること。

### dev で疎通

```bash
# 1. 新規ユーザーで Google サインインし is_onboarded=false 状態にする
# 2. /api/auth/me で id と is_onboarded を確認

curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"NewUser","birth_date":"1995-05-15","gender":"MALE"}' \
  http://localhost:8080/api/users/<MY_USER_ID>/onboarding

# 200 + is_onboarded:true で返ること

# 同じリクエストをもう一度送ると 409 になること
```

## 既知の未対応 / 後続 step に持ち越し

- avatar_url のアップロード処理は本 API では行わない。Google アカウントから取得したものをそのまま利用する想定（プロフィール画像変更は step3 の PUT で）
- 「自分以外の id を渡されたとき」を 403 で扱っているが、middleware で `:id` を `req.userId` 強制に書き換える設計に将来変える可能性あり
