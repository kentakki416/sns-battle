# step6-api-matching-preferences.md

`GET /api/matching/preferences` と `PUT /api/matching/preferences` を実装する。自分のマッチングフィルタ設定を取得・更新する API。マッチング機能（Phase 4）から実マッチング時に参照される。

設計詳細は `docs/spec/profile/README.md` の [API 設計](./README.md#api-設計) を参照。

依存: step1（`matching_preferences` テーブル）、step5（`HobbyRepository`）。

## 仕様

- 認証: Access Token（middleware で必須）
- パス: `/api/matching/preferences`（自分のレコードを暗黙的に対象とする。pathParam 不要）
- フィールド:
  - `preferred_genders: Gender[]`（空配列 = 制限なし）
  - `age_min: number | null`、`age_max: number | null`
  - `preferred_locations: string[]`（空配列 = 制限なし）
  - `preferred_mbti: MbtiType[]`（空配列 = 制限なし）
  - `preferred_hobby_ids: number[]`（空配列 = 制限なし、有効な hobby_master.id のみ）
- GET: レコード未作成時はデフォルト値（全配列空、age_min/max=null）を返す（404 ではなく 200）
- PUT: 初回呼び出しは upsert で作成、既存ある場合は更新
- バリデーション:
  - `age_min` / `age_max` は 18〜120 の範囲、`age_min <= age_max`
  - `preferred_hobby_ids` は `hobby_masters` に存在する有効 id のみ
  - 配列のサイズ上限: gender 3 / location 20 / mbti 16 / hobby 20

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/matching-preference.ts`、新規）

```typescript
import { z } from "zod"

import { genderSchema, mbtiSchema } from "./user"

// ========================================================
// GET /api/matching/preferences - フィルタ取得
// ========================================================

export const matchingPreferenceSchema = z.object({
  age_max: z.number().int().nullable(),
  age_min: z.number().int().nullable(),
  preferred_genders: z.array(genderSchema),
  preferred_hobby_ids: z.array(z.number().int().positive()),
  preferred_locations: z.array(z.string()),
  preferred_mbti: z.array(mbtiSchema),
})

export const getMatchingPreferenceResponseSchema = matchingPreferenceSchema

// ========================================================
// PUT /api/matching/preferences - フィルタ更新（upsert）
// ========================================================

export const updateMatchingPreferenceRequestSchema = z.object({
  age_max: z.number().int().min(18).max(120).nullable(),
  age_min: z.number().int().min(18).max(120).nullable(),
  preferred_genders: z.array(genderSchema).max(3),
  preferred_hobby_ids: z.array(z.number().int().positive()).max(20),
  preferred_locations: z.array(z.string().max(100)).max(20),
  preferred_mbti: z.array(mbtiSchema).max(16),
})

export const updateMatchingPreferenceResponseSchema = matchingPreferenceSchema

export type MatchingPreference = z.infer<typeof matchingPreferenceSchema>
export type GetMatchingPreferenceResponse = z.infer<typeof getMatchingPreferenceResponseSchema>
export type UpdateMatchingPreferenceRequest = z.infer<typeof updateMatchingPreferenceRequestSchema>
export type UpdateMatchingPreferenceResponse = z.infer<typeof updateMatchingPreferenceResponseSchema>
```

`packages/schema/src/api-schema/index.ts` に追記:

```typescript
export * from "./matching-preference"
```

スキーマ追加後:

```bash
cd packages/schema && pnpm build
```

### Repository: `MatchingPreferenceRepository`

`apps/api/src/repository/prisma/matching-preference-repository.ts`（新規）。

```typescript
import { Gender, MatchingPreference } from "../../types/domain"
import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"

export type UpsertMatchingPreferenceInput = {
  ageMax: number | null
  ageMin: number | null
  preferredGenders: Gender[]
  preferredHobbyIds: number[]
  preferredLocations: string[]
  preferredMbti: string[]
}

export interface MatchingPreferenceRepository {
  findByUserId(userId: number): Promise<MatchingPreference | null>
  upsertByUserId(userId: number, data: UpsertMatchingPreferenceInput): Promise<MatchingPreference>
}

export class PrismaMatchingPreferenceRepository implements MatchingPreferenceRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<MatchingPreference | null> {
    const row = await this._prisma.matchingPreference.findUnique({ where: { userId } })
    if (!row) return null
    return this._toDomain(row)
  }

  async upsertByUserId(userId: number, data: UpsertMatchingPreferenceInput): Promise<MatchingPreference> {
    const row = await this._prisma.matchingPreference.upsert({
      create: {
        ageMax: data.ageMax,
        ageMin: data.ageMin,
        preferredGenders: data.preferredGenders,
        preferredHobbyIds: data.preferredHobbyIds,
        preferredLocations: data.preferredLocations,
        preferredMbti: data.preferredMbti,
        userId,
      },
      update: {
        ageMax: data.ageMax,
        ageMin: data.ageMin,
        preferredGenders: data.preferredGenders,
        preferredHobbyIds: data.preferredHobbyIds,
        preferredLocations: data.preferredLocations,
        preferredMbti: data.preferredMbti,
      },
      where: { userId },
    })
    return this._toDomain(row)
  }

  private _toDomain(row: PrismaTypes.MatchingPreferenceGetPayload<{}>): MatchingPreference {
    return {
      ageMax: row.ageMax,
      ageMin: row.ageMin,
      id: row.id,
      preferredGenders: row.preferredGenders,
      preferredHobbyIds: row.preferredHobbyIds,
      preferredLocations: row.preferredLocations,
      preferredMbti: row.preferredMbti,
      userId: row.userId,
    }
  }
}
```

`apps/api/src/repository/prisma/index.ts` から export。

### Service: `getMatchingPreference` / `upsertMatchingPreference`

`apps/api/src/service/matching-preference-service.ts`（新規）。

```typescript
import { logger } from "../log"
import { HobbyRepository, MatchingPreferenceRepository } from "../repository/prisma"
import { Gender, MatchingPreference } from "../types/domain"
import { badRequestError, err, ok, Result } from "../types/result"

const DEFAULT_PREFERENCE = (userId: number): MatchingPreference => ({
  ageMax: null,
  ageMin: null,
  id: 0,
  preferredGenders: [],
  preferredHobbyIds: [],
  preferredLocations: [],
  preferredMbti: [],
  userId,
})

export const getMatchingPreference = async (
  userId: number,
  repo: { matchingPreferenceRepository: MatchingPreferenceRepository },
): Promise<Result<MatchingPreference>> => {
  logger.debug("MatchingPreferenceService: Fetching preference", { userId })
  const found = await repo.matchingPreferenceRepository.findByUserId(userId)
  return ok(found ?? DEFAULT_PREFERENCE(userId))
}

export type UpsertMatchingPreferenceInput = {
  ageMax: number | null
  ageMin: number | null
  preferredGenders: Gender[]
  preferredHobbyIds: number[]
  preferredLocations: string[]
  preferredMbti: string[]
}

export const upsertMatchingPreference = async (
  input: { userId: number; data: UpsertMatchingPreferenceInput },
  repo: {
    hobbyRepository: HobbyRepository
    matchingPreferenceRepository: MatchingPreferenceRepository
  },
): Promise<Result<MatchingPreference>> => {
  const { userId, data } = input
  logger.debug("MatchingPreferenceService: Upserting preference", { userId })

  /** age_min <= age_max（両方値がある場合） */
  if (data.ageMin !== null && data.ageMax !== null && data.ageMin > data.ageMax) {
    return err(badRequestError("age_min must be less than or equal to age_max"))
  }

  /** hobby_ids が有効か */
  if (data.preferredHobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.preferredHobbyIds)
    if (found.length !== data.preferredHobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  const upserted = await repo.matchingPreferenceRepository.upsertByUserId(userId, data)
  return ok(upserted)
}
```

`apps/api/src/service/index.ts`:

```typescript
export * as matchingPreference from "./matching-preference-service"
```

### Controller

`apps/api/src/controller/matching-preference/get.ts`（新規）。

```typescript
import { Response } from "express"

import { ErrorResponse, getMatchingPreferenceResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingPreferenceRepository } from "../../repository/prisma"
import * as service from "../../service"

export class MatchingPreferenceGetController {
  constructor(private matchingPreferenceRepository: MatchingPreferenceRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingPreferenceGetController: Fetching preference", { userId: req.userId })

    const result = await service.matchingPreference.getMatchingPreference(req.userId!, {
      matchingPreferenceRepository: this.matchingPreferenceRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMatchingPreferenceResponseSchema.parse({
      age_max: result.value.ageMax,
      age_min: result.value.ageMin,
      preferred_genders: result.value.preferredGenders,
      preferred_hobby_ids: result.value.preferredHobbyIds,
      preferred_locations: result.value.preferredLocations,
      preferred_mbti: result.value.preferredMbti,
    })

    return res.status(200).json(response)
  }
}
```

`apps/api/src/controller/matching-preference/update.ts`（新規）。

```typescript
import { Response } from "express"

import {
  ErrorResponse,
  updateMatchingPreferenceRequestSchema,
  updateMatchingPreferenceResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { HobbyRepository, MatchingPreferenceRepository } from "../../repository/prisma"
import * as service from "../../service"

export class MatchingPreferenceUpdateController {
  constructor(
    private matchingPreferenceRepository: MatchingPreferenceRepository,
    private hobbyRepository: HobbyRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const body = updateMatchingPreferenceRequestSchema.parse(req.body)

    logger.info("MatchingPreferenceUpdateController: Upserting preference", { userId: req.userId })

    const result = await service.matchingPreference.upsertMatchingPreference(
      {
        data: {
          ageMax: body.age_max,
          ageMin: body.age_min,
          preferredGenders: body.preferred_genders,
          preferredHobbyIds: body.preferred_hobby_ids,
          preferredLocations: body.preferred_locations,
          preferredMbti: body.preferred_mbti,
        },
        userId: req.userId!,
      },
      {
        hobbyRepository: this.hobbyRepository,
        matchingPreferenceRepository: this.matchingPreferenceRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = updateMatchingPreferenceResponseSchema.parse({
      age_max: result.value.ageMax,
      age_min: result.value.ageMin,
      preferred_genders: result.value.preferredGenders,
      preferred_hobby_ids: result.value.preferredHobbyIds,
      preferred_locations: result.value.preferredLocations,
      preferred_mbti: result.value.preferredMbti,
    })

    return res.status(200).json(response)
  }
}
```

### Router

`apps/api/src/routes/matching-preference-router.ts`（新規）。

```typescript
import { Router } from "express"

import { MatchingPreferenceGetController } from "../controller/matching-preference/get"
import { MatchingPreferenceUpdateController } from "../controller/matching-preference/update"

type MatchingPreferenceRouterControllers = {
  get?: MatchingPreferenceGetController
  update?: MatchingPreferenceUpdateController
}

export const matchingPreferenceRouter = (
  controllers: MatchingPreferenceRouterControllers,
): Router => {
  const router = Router()

  if (controllers.get) {
    const controller = controllers.get
    router.get("/", async (req, res) => controller.execute(req, res))
  }
  if (controllers.update) {
    const controller = controllers.update
    router.put("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

### DI（`apps/api/src/index.ts`）

```typescript
import { MatchingPreferenceGetController } from "./controller/matching-preference/get"
import { MatchingPreferenceUpdateController } from "./controller/matching-preference/update"
import { PrismaMatchingPreferenceRepository } from "./repository/prisma/matching-preference-repository"
import { matchingPreferenceRouter } from "./routes/matching-preference-router"

const matchingPreferenceRepository = new PrismaMatchingPreferenceRepository(prisma)

const matchingPreferenceGetController = new MatchingPreferenceGetController(matchingPreferenceRepository)
const matchingPreferenceUpdateController = new MatchingPreferenceUpdateController(
  matchingPreferenceRepository,
  hobbyRepository,
)

app.use(
  "/api/matching/preferences",
  matchingPreferenceRouter({
    get: matchingPreferenceGetController,
    update: matchingPreferenceUpdateController,
  })
)
```

### Service ユニットテスト

`apps/api/test/service/matching-preference-service/getMatchingPreference.test.ts`（新規）:

検証ケース:
1. レコード存在 → ok、レコード値を返す
2. レコード未作成 → ok、デフォルト値（全配列空、age_min/max=null）を返す
3. DB エラー → throw

`apps/api/test/service/matching-preference-service/upsertMatchingPreference.test.ts`（新規）:

検証ケース:
1. 初回呼び出し（レコード未作成） → upsert で create、ok 返却
2. 既存ある場合 → upsert で update、ok 返却
3. age_min > age_max → 400 BAD_REQUEST
4. age_min == age_max → ok（境界値）
5. 片方が null → ok（バリデーションスキップ）
6. preferredHobbyIds に存在しない id → 400
7. すべて空配列 / null → ok（フィルタ無効化）

### Controller インテグレーションテスト

`apps/api/test/controller/matching-preference/get.test.ts`、`update.test.ts`（新規）。

GET 検証ケース:
1. レコード未作成のユーザー → 200、デフォルト値（空配列 + null）
2. レコード作成済 → 200、保存値
3. 認証なし → 401

UPDATE 検証ケース:
1. 初回 PUT（レコード未作成） → 200、DB に作成、レスポンスは保存値
2. 2 回目 PUT → 200、DB が更新（同 user_id で 1 行のみ）
3. age_min > age_max → 400
4. preferred_hobby_ids に未登録 id → 400
5. preferred_genders に 4 件 → 400（Zod max(3)）
6. preferred_mbti に "AAAA" → 400（Zod）
7. 全フィールド空配列 / null → 200、DB に作成
8. 認証なし → 401

例（初回 PUT）:

```typescript
it("初回 PUT でレコードが作成される", async () => {
  const me = await testPrisma.user.create({ data: { email: "me@example.com", name: "Me" } })
  const hobby = await testPrisma.hobbyMaster.create({ data: { name: "h1", sortOrder: 1 } })
  const token = generateAccessToken(me.id)

  const res = await request(app)
    .put("/api/matching/preferences")
    .set("Authorization", `Bearer ${token}`)
    .send({
      age_max: 35,
      age_min: 25,
      preferred_genders: ["FEMALE", "OTHER"],
      preferred_hobby_ids: [hobby.id],
      preferred_locations: ["Tokyo", "Osaka"],
      preferred_mbti: ["INTJ", "ENFP"],
    })

  expect(res.status).toBe(200)
  expect(res.body).toEqual({
    age_max: 35,
    age_min: 25,
    preferred_genders: ["FEMALE", "OTHER"],
    preferred_hobby_ids: [hobby.id],
    preferred_locations: ["Tokyo", "Osaka"],
    preferred_mbti: ["INTJ", "ENFP"],
  })

  const stored = await testPrisma.matchingPreference.findUnique({ where: { userId: me.id } })
  expect(stored).toMatchObject({
    ageMax: 35,
    ageMin: 25,
    preferredGenders: ["FEMALE", "OTHER"],
    preferredHobbyIds: [hobby.id],
    preferredLocations: ["Tokyo", "Osaka"],
    preferredMbti: ["INTJ", "ENFP"],
    userId: me.id,
  })
})
```

### setup.ts の cleanupTestData に matching_preferences を追加

```typescript
await testPrisma.matchingPreference.deleteMany()
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

新規 Service ユニット 10 ケース、Controller integration 11 ケースが通ること。

### dev 疎通

```bash
# レコード未作成 → デフォルト値
curl -H "Authorization: Bearer <ACCESS_TOKEN>" http://localhost:8080/api/matching/preferences

# 初回作成
curl -X PUT \
  -H "Authorization: Bearer <ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"preferred_genders":["FEMALE"],"age_min":25,"age_max":35,"preferred_locations":["Tokyo"],"preferred_mbti":["INTJ"],"preferred_hobby_ids":[1,2]}' \
  http://localhost:8080/api/matching/preferences
```

200 と保存内容が返ること。

## 既知の未対応 / 後続 step に持ち越し

- 実マッチングロジックでこのフィルタを適用するのは Phase 4（matching）
- 趣味の重複度に応じた相性スコアは Phase 8（MBTI・会話アシスト）と合わせて将来対応
