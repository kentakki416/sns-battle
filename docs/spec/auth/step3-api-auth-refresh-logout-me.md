# step3-api-auth-refresh-logout-me.md

`POST /api/auth/refresh` / `POST /api/auth/logout` / `GET /api/auth/me` の 3 エンドポイントを完成させる。`me` は step2 までで実装済みだが、`User` 型に `bio` / `is_onboarded` が増えた変更を反映するため本 step に含める。

Refresh Token はローテーション方式（1 回使用で無効化）。短いグレース期間は本 step では実装しない（同時リフレッシュ問題は Next.js 側のミューテックスで吸収する。step4 参照）。

## 対応内容

### `@repo/api-schema` の追加

`packages/schema/src/api-schema/auth.ts` に追加する。

```typescript
// ========================================================
// POST /api/auth/refresh - Access/Refresh Token のローテーション
// ========================================================

/**
 * Refresh Token によるトークン更新リクエストのスキーマ
 */
export const authRefreshRequestSchema = z.object({
  refresh_token: z.string().min(1),
})

export type AuthRefreshRequest = z.infer<typeof authRefreshRequestSchema>

/**
 * Refresh Token によるトークン更新レスポンスのスキーマ
 */
export const authRefreshResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
})

export type AuthRefreshResponse = z.infer<typeof authRefreshResponseSchema>

// ========================================================
// POST /api/auth/logout - Refresh Token を無効化
// ========================================================

/**
 * ログアウトリクエストのスキーマ
 */
export const authLogoutRequestSchema = z.object({
  refresh_token: z.string().min(1),
})

export type AuthLogoutRequest = z.infer<typeof authLogoutRequestSchema>

/**
 * ログアウトレスポンスのスキーマ
 */
export const authLogoutResponseSchema = z.object({
  message: z.literal("OK"),
})

export type AuthLogoutResponse = z.infer<typeof authLogoutResponseSchema>
```

`me` レスポンスは step1 で `bio` / `is_onboarded` を追加済みのため変更なし。

スキーマ更新後 `cd packages/schema && pnpm build`。

### auth-service: `refreshTokens` と `logout`

`apps/api/src/service/auth-service.ts` に以下を追加する。

```typescript
import { err, ok, Result, unauthorizedError } from "../types/result"

export type RefreshTokensSuccess = {
    accessToken: string
    refreshToken: string
}

export const refreshTokens = async (
  input: { refreshToken: string },
  repository: { refreshTokenRepository: RefreshTokenRepository },
  verifier: (token: string) => { jti: string; userId: number } | null,
  generators: TokenGenerators
): Promise<Result<RefreshTokensSuccess>> => {
  const payload = verifier(input.refreshToken)
  if (!payload) {
    return err(unauthorizedError("Invalid refresh token"))
  }

  const userId = await repository.refreshTokenRepository.findUserId(payload.jti)
  if (userId === null || userId !== payload.userId) {
    return err(unauthorizedError("Refresh token has been revoked"))
  }

  /** ローテーション: 旧 jti を破棄して新しい jti を発行 */
  await repository.refreshTokenRepository.delete(payload.jti)

  const accessToken = generators.generateAccessToken(userId)
  const { jti, token: refreshToken } = generators.generateRefreshToken(userId)
  await repository.refreshTokenRepository.save(jti, userId, REFRESH_TTL_SECONDS)

  return ok({ accessToken, refreshToken })
}

export const logout = async (
  input: { refreshToken: string },
  repository: { refreshTokenRepository: RefreshTokenRepository },
  verifier: (token: string) => { jti: string; userId: number } | null
): Promise<Result<{ ok: true }>> => {
  const payload = verifier(input.refreshToken)
  if (!payload) {
    /** 無効なトークンでも 200 を返す（冪等性のため）。Result で表現しない */
    return ok({ ok: true })
  }
  await repository.refreshTokenRepository.delete(payload.jti)
  return ok({ ok: true })
}
```

`unauthorizedError` ヘルパーは `src/types/result.ts` に既存。なければ `{ statusCode: 401, type: "UNAUTHORIZED", message }` で追加する。

### Controller の追加

`apps/api/src/controller/auth/refresh.ts` を新規作成する。

```typescript
import { Request, Response } from "express"

import { authRefreshRequestSchema, authRefreshResponseSchema, ErrorResponse } from "@repo/api-schema"

import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../lib/jwt"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

export class AuthRefreshController {
  constructor(private refreshTokenRepository: RefreshTokenRepository) {}

  async execute(req: Request, res: Response) {
    const { refresh_token: refreshToken } = authRefreshRequestSchema.parse(req.body)

    const result = await service.auth.refreshTokens(
      { refreshToken },
      { refreshTokenRepository: this.refreshTokenRepository },
      (token) => {
        const payload = verifyRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.userId } : null
      },
      { generateAccessToken, generateRefreshToken }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = authRefreshResponseSchema.parse({
      access_token: result.value.accessToken,
      refresh_token: result.value.refreshToken,
    })
    return res.status(200).json(response)
  }
}
```

`apps/api/src/controller/auth/logout.ts` を新規作成する。

```typescript
import { Request, Response } from "express"

import { authLogoutRequestSchema, authLogoutResponseSchema, ErrorResponse } from "@repo/api-schema"

import { verifyRefreshToken } from "../../lib/jwt"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

export class AuthLogoutController {
  constructor(private refreshTokenRepository: RefreshTokenRepository) {}

  async execute(req: Request, res: Response) {
    const { refresh_token: refreshToken } = authLogoutRequestSchema.parse(req.body)

    const result = await service.auth.logout(
      { refreshToken },
      { refreshTokenRepository: this.refreshTokenRepository },
      (token) => {
        const payload = verifyRefreshToken(token)
        return payload ? { jti: payload.jti, userId: payload.userId } : null
      }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(authLogoutResponseSchema.parse({ message: "OK" }))
  }
}
```

### `me` の更新

`apps/api/src/controller/auth/me.ts` のレスポンスに `bio` / `is_onboarded` を追加する。

```typescript
const response = authMeResponseSchema.parse({
  avatar_url: result.value.avatarUrl,
  bio: result.value.bio,
  created_at: result.value.createdAt.toISOString(),
  email: result.value.email,
  id: result.value.id,
  is_onboarded: result.value.isOnboarded,
  name: result.value.name,
})
```

### Router の更新

`apps/api/src/routes/auth-router.ts` に `refresh` / `logout` を追加する。

```typescript
type AuthRouterControllers = {
  google?: AuthGoogleController
  logout?: AuthLogoutController
  me?: AuthMeController
  refresh?: AuthRefreshController
}

export const authRouter = (controllers: AuthRouterControllers): Router => {
  const router = Router()

  if (controllers.google) {
    const c = controllers.google
    router.post("/google", async (req, res) => c.execute(req, res))
  }
  if (controllers.refresh) {
    const c = controllers.refresh
    router.post("/refresh", async (req, res) => c.execute(req, res))
  }
  if (controllers.logout) {
    const c = controllers.logout
    router.post("/logout", async (req, res) => c.execute(req, res))
  }
  if (controllers.me) {
    const c = controllers.me
    router.get("/me", async (req, res) => c.execute(req, res))
  }

  return router
}
```

`/api/auth/refresh` は `PUBLIC_PATHS` に含める（access token 期限切れ時に呼ぶため認証不要）。`/api/auth/logout` は **認証必須**（`PUBLIC_PATHS` に含めない）にすることでアクセストークン保持者のみがログアウト可能になる。

### DI の更新

`apps/api/src/index.ts` にコントローラーのインスタンス化と登録を追加する。

```typescript
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthRefreshController } from "./controller/auth/refresh"

const authRefreshController = new AuthRefreshController(refreshTokenRepository)
const authLogoutController = new AuthLogoutController(refreshTokenRepository)

app.use(
  "/api/auth",
  authRouter({
    google: authGoogleController,
    logout: authLogoutController,
    me: authMeController,
    refresh: authRefreshController,
  })
)
```

## 動作確認

### Service ユニットテスト

`apps/api/test/service/auth-service/refreshTokens.test.ts` を新規作成する。

```typescript
import { refreshTokens } from "../../../src/service/auth-service"

describe("refreshTokens", () => {
  const mockRepo = { delete: jest.fn(), findUserId: jest.fn(), save: jest.fn() }
  const mockGenerators = {
    generateAccessToken: jest.fn(() => "new.access"),
    generateRefreshToken: jest.fn(() => ({ jti: "new-jti", token: "new.refresh" })),
  }

  beforeEach(() => jest.clearAllMocks())

  it("正常系: 新しいトークンが発行され、旧 jti が破棄される", async () => {
    mockRepo.findUserId.mockResolvedValue(1)
    const result = await refreshTokens(
      { refreshToken: "valid" },
      { refreshTokenRepository: mockRepo as never },
      () => ({ jti: "old-jti", userId: 1 }),
      mockGenerators
    )

    expect(result.ok).toBe(true)
    expect(mockRepo.delete).toHaveBeenCalledWith("old-jti")
    expect(mockRepo.save).toHaveBeenCalledWith("new-jti", 1, expect.any(Number))
  })

  it("検証失敗: 401 UNAUTHORIZED", async () => {
    const result = await refreshTokens(
      { refreshToken: "broken" },
      { refreshTokenRepository: mockRepo as never },
      () => null,
      mockGenerators
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(401)
      expect(result.error.type).toBe("UNAUTHORIZED")
    }
  })

  it("Redis に jti が無い: 401 UNAUTHORIZED（再利用検知）", async () => {
    mockRepo.findUserId.mockResolvedValue(null)
    const result = await refreshTokens(
      { refreshToken: "revoked" },
      { refreshTokenRepository: mockRepo as never },
      () => ({ jti: "old", userId: 1 }),
      mockGenerators
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(401)
    }
  })

  it("userId が一致しない: 401 UNAUTHORIZED", async () => {
    mockRepo.findUserId.mockResolvedValue(2)
    const result = await refreshTokens(
      { refreshToken: "mismatch" },
      { refreshTokenRepository: mockRepo as never },
      () => ({ jti: "old", userId: 1 }),
      mockGenerators
    )
    expect(result.ok).toBe(false)
  })
})
```

`logout.test.ts` も同様に「正常系で `delete` が呼ばれる」「検証失敗でも 200 が返る（冪等）」を検証する。

### Controller インテグレーションテスト

`apps/api/test/controller/auth/refresh.test.ts` / `logout.test.ts` を新規作成する。Redis は `ioredis-mock` を使用するか、テスト用 Redis インスタンスを立てる方針を helper に追加する。テスト方針（文言 assertion 禁止 / `statusCode` のみ確認）は CLAUDE.md に従う。

### 手動疎通

```bash
# refresh
curl -X POST http://localhost:8080/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"<token>\"}"

# logout（access token 必須）
curl -X POST http://localhost:8080/api/auth/logout \
  -H "Authorization: Bearer <access_token>" \
  -H "Content-Type: application/json" \
  -d "{\"refresh_token\":\"<token>\"}"

# me
curl http://localhost:8080/api/auth/me \
  -H "Authorization: Bearer <access_token>"
```

`refresh` を 2 回続けて叩くと 2 回目は 401（旧 jti が破棄されているため）になることを確認する。
