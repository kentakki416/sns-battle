# step2-api-auth-google.md

`POST /api/auth/google` を実装する。Next.js から Authorization Code を受け取り、Google から UserInfo を取得し、ユーザーを upsert したうえで Access Token + Refresh Token を発行する。

既存の `GET /api/auth/google` / `GET /api/auth/google/callback`（フルリダイレクト方式）は **本 step で削除する**。Next.js が OAuth URL を生成しコードを Express へ POST する方式に統一する（`docs/spec/auth/README.md` のフロー図参照）。

## 対応内容

### 環境変数

`apps/api/.env.local` に追加。

```bash
cd apps/api
npx dotenvx set JWT_ACCESS_SECRET "<openssl rand -base64 32>" -f .env.local
npx dotenvx set JWT_REFRESH_SECRET "<openssl rand -base64 32>" -f .env.local
npx dotenvx set JWT_ACCESS_EXPIRATION "15m" -f .env.local
npx dotenvx set JWT_REFRESH_EXPIRATION "7d" -f .env.local
```

既存の `JWT_SECRET` / `JWT_EXPIRATION` は本 step 完了後に削除する（後方互換は不要）。

### `apps/api/src/lib/jwt.ts` の更新

Access / Refresh の 2 種類を扱うよう関数を分割する。Refresh Token には `jti`（UUID）を含める。

```typescript
import { randomUUID } from "node:crypto"

import jwt, { type Secret, type SignOptions } from "jsonwebtoken"

const JWT_ACCESS_SECRET: Secret = process.env.JWT_ACCESS_SECRET as string
const JWT_REFRESH_SECRET: Secret = process.env.JWT_REFRESH_SECRET as string
const JWT_ACCESS_EXPIRATION = (process.env.JWT_ACCESS_EXPIRATION || "15m") as SignOptions["expiresIn"]
const JWT_REFRESH_EXPIRATION = (process.env.JWT_REFRESH_EXPIRATION || "7d") as SignOptions["expiresIn"]

export type AccessTokenPayload = {
    exp?: number
    iat?: number
    userId: number
}

export type RefreshTokenPayload = {
    exp?: number
    iat?: number
    jti: string
    userId: number
}

export const generateAccessToken = (userId: number): string => {
  return jwt.sign({ userId }, JWT_ACCESS_SECRET, { expiresIn: JWT_ACCESS_EXPIRATION })
}

export const generateRefreshToken = (userId: number): { jti: string; token: string } => {
  const jti = randomUUID()
  const token = jwt.sign({ jti, userId }, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRATION })
  return { jti, token }
}

export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_ACCESS_SECRET) as AccessTokenPayload
  } catch {
    return null
  }
}

export const verifyRefreshToken = (token: string): RefreshTokenPayload | null => {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as RefreshTokenPayload
  } catch {
    return null
  }
}
```

`apps/api/src/middleware/auth.ts` 側は `verifyToken` → `verifyAccessToken` に置換する。

### Refresh Token Repository（Redis）

`apps/api/src/repository/redis/refresh-token-repository.ts` を新設する。`auth-service` から DI で渡せるようインターフェース + 実装の分離を保つ。

```typescript
import type Redis from "ioredis"

export interface RefreshTokenRepository {
    delete(jti: string): Promise<void>
    findUserId(jti: string): Promise<number | null>
    save(jti: string, userId: number, ttlSeconds: number): Promise<void>
}

const keyOf = (jti: string) => `refresh_token:${jti}`

export class IoRedisRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private redis: Redis) {}

  async save(jti: string, userId: number, ttlSeconds: number): Promise<void> {
    await this.redis.set(keyOf(jti), String(userId), "EX", ttlSeconds)
  }

  async findUserId(jti: string): Promise<number | null> {
    const raw = await this.redis.get(keyOf(jti))
    return raw === null ? null : Number(raw)
  }

  async delete(jti: string): Promise<void> {
    await this.redis.del(keyOf(jti))
  }
}
```

`apps/api/src/repository/redis/index.ts`（既存 or 新規）からバレルエクスポートする。

### `@repo/api-schema` のスキーマ整理

`packages/schema/src/api-schema/auth.ts` を以下に置き換える（`authGoogleCallbackPathParamSchema` / `authGoogleCallbackResponseSchema` は削除）。

```typescript
import { z } from "zod"

// ========================================================
// POST /api/auth/google - Google OAuth 認証コードの検証
// ========================================================

/**
 * Google OAuth 認証リクエストのスキーマ
 */
export const authGoogleRequestSchema = z.object({
  code: z.string().min(1),
  redirect_uri: z.string().url(),
})

export type AuthGoogleRequest = z.infer<typeof authGoogleRequestSchema>

/**
 * Google OAuth 認証レスポンスのスキーマ
 */
export const authGoogleResponseSchema = z.object({
  access_token: z.string(),
  is_new_user: z.boolean(),
  refresh_token: z.string(),
  user: z.object({
    avatar_url: z.string().nullable(),
    bio: z.string().nullable(),
    email: z.string().nullable(),
    id: z.number(),
    is_onboarded: z.boolean(),
    name: z.string().nullable(),
    created_at: z.string(),
  }),
})

export type AuthGoogleResponse = z.infer<typeof authGoogleResponseSchema>
```

スキーマ更新後は必ず `cd packages/schema && pnpm build`。

### Google OAuth Client の調整

`apps/api/src/client/google-oauth.ts` の `getUserInfo(code)` は **Next.js 側でリダイレクトされた `redirect_uri` で発行されたコード** を検証する必要があるため、`getUserInfo(code, redirectUri)` のシグネチャに変更する。

`google-auth-library` の `OAuth2Client` は `redirect_uri` をコンストラクタで固定しているため、リクエスト毎に新しいクライアントを生成するか、`oAuth2Client.redirectUri = redirectUri` を呼び出して切り替える。本プロジェクトでは前者（テスト容易性のため）を推奨する。

### auth-service の置き換え

`apps/api/src/service/auth-service.ts` の `authenticateWithGoogle` を以下に置き換える。

```typescript
import type { IGoogleOAuthClient, GoogleUserInfo } from "../client/google-oauth"
import { logger } from "../log"
import {
  AuthAccountRepository,
  UserRegistrationRepository,
} from "../repository/prisma"
import { RefreshTokenRepository } from "../repository/redis"
import { User } from "../types/domain"
import { ok, Result } from "../types/result"

export type AuthenticateWithGoogleSuccess = {
    accessToken: string
    isNewUser: boolean
    refreshToken: string
    user: User
}

type Repositories = {
    authAccountRepository: AuthAccountRepository
    refreshTokenRepository: RefreshTokenRepository
    userRegistrationRepository: UserRegistrationRepository
}

type TokenGenerators = {
    generateAccessToken: (userId: number) => string
    generateRefreshToken: (userId: number) => { jti: string; token: string }
}

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

export const authenticateWithGoogle = async (
  input: { code: string; redirectUri: string },
  repository: Repositories,
  googleAuthClient: IGoogleOAuthClient,
  tokenGenerators: TokenGenerators
): Promise<Result<AuthenticateWithGoogleSuccess>> => {
  logger.info("AuthService: Starting Google authentication")

  const googleUser: GoogleUserInfo = await googleAuthClient.getUserInfo(input.code, input.redirectUri)

  const existingAccount = await repository.authAccountRepository.findByProvider("google", googleUser.id)

  let user: User
  let isNewUser = false

  if (existingAccount) {
    user = existingAccount.user
  } else {
    isNewUser = true
    user = await repository.userRegistrationRepository.createUserWithAuthAccountTx({
      authAccount: {
        provider: "google",
        providerAccountId: googleUser.id,
      },
      user: {
        avatarUrl: googleUser.picture,
        email: googleUser.email,
        name: googleUser.name,
      },
    })
  }

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repository.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  logger.debug("AuthService: Tokens issued", { userId: user.id })

  return ok({ accessToken, isNewUser, refreshToken, user })
}
```

### Controller の置き換え

`apps/api/src/controller/auth/google.ts` を **POST 版** に書き換える。`google-callback.ts` は削除する。

```typescript
import { Request, Response } from "express"

import { authGoogleRequestSchema, authGoogleResponseSchema, ErrorResponse } from "@repo/api-schema"

import { IGoogleOAuthClient } from "../../client/google-oauth"
import { generateAccessToken, generateRefreshToken } from "../../lib/jwt"
import { AuthAccountRepository, UserRegistrationRepository } from "../../repository/prisma"
import { RefreshTokenRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * Google OAuth 認証コードを検証し、Access/Refresh Token を発行する API
 */
export class AuthGoogleController {
  constructor(
    private authAccountRepository: AuthAccountRepository,
    private userRegistrationRepository: UserRegistrationRepository,
    private refreshTokenRepository: RefreshTokenRepository,
    private googleOAuthClient: IGoogleOAuthClient
  ) {}

  async execute(req: Request, res: Response) {
    const { code, redirect_uri: redirectUri } = authGoogleRequestSchema.parse(req.body)

    const result = await service.auth.authenticateWithGoogle(
      { code, redirectUri },
      {
        authAccountRepository: this.authAccountRepository,
        refreshTokenRepository: this.refreshTokenRepository,
        userRegistrationRepository: this.userRegistrationRepository,
      },
      this.googleOAuthClient,
      { generateAccessToken, generateRefreshToken }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const { accessToken, isNewUser, refreshToken, user } = result.value

    const response = authGoogleResponseSchema.parse({
      access_token: accessToken,
      is_new_user: isNewUser,
      refresh_token: refreshToken,
      user: {
        avatar_url: user.avatarUrl,
        bio: user.bio,
        created_at: user.createdAt.toISOString(),
        email: user.email,
        id: user.id,
        is_onboarded: user.isOnboarded,
        name: user.name,
      },
    })

    return res.status(200).json(response)
  }
}
```

### Router の更新

`apps/api/src/routes/auth-router.ts` から `callback` を削除し、`google` を **POST** に変更する。`me` はそのまま。

```typescript
import { Router } from "express"

import { AuthGoogleController } from "../controller/auth/google"
import { AuthMeController } from "../controller/auth/me"

type AuthRouterControllers = {
  google?: AuthGoogleController
  me?: AuthMeController
}

export const authRouter = (controllers: AuthRouterControllers): Router => {
  const router = Router()

  if (controllers.google) {
    const controller = controllers.google
    router.post("/google", async (req, res) => controller.execute(req, res))
  }

  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  return router
}
```

### `PUBLIC_PATHS` の更新

`apps/api/src/const/index.ts` で `/api/auth/google` を公開パスに含める（既存の `GET` 用エントリは差し替え）。`/api/auth/refresh` も追加（step3 で使うが先に登録しておいても害はない）。

```typescript
export const PUBLIC_PATHS = [
  "/api/health",
  "/api/auth/google",
  "/api/auth/refresh",
]
```

### DI の組み直し

`apps/api/src/index.ts` を以下のように調整する（差分のみ抜粋）。

```typescript
import { IoRedisRefreshTokenRepository } from "./repository/redis"

const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRegistrationRepository,
  refreshTokenRepository,
  googleOAuthClient,
)

app.use(
  "/api/auth",
  authRouter({
    google: authGoogleController,
    me: authMeController,
  })
)
```

`AuthGoogleCallbackController` の import / インスタンス化は削除する。

## 動作確認

### Service ユニットテスト

`apps/api/test/service/auth-service/authenticateWithGoogle.test.ts` を更新する。文言の assertion は禁止。

```typescript
import { authenticateWithGoogle } from "../../../src/service/auth-service"

describe("authenticateWithGoogle", () => {
  const mockGoogleClient = {
    generateAuthUrl: jest.fn(),
    getUserInfo: jest.fn(),
  }
  const mockAuthAccountRepo = { findByProvider: jest.fn() }
  const mockUserRegistrationRepo = { createUserWithAuthAccountTx: jest.fn() }
  const mockRefreshTokenRepo = { delete: jest.fn(), findUserId: jest.fn(), save: jest.fn() }
  const mockGenerators = {
    generateAccessToken: jest.fn(() => "access.jwt"),
    generateRefreshToken: jest.fn(() => ({ jti: "uuid-1", token: "refresh.jwt" })),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("既存ユーザーは isNewUser=false でトークンが発行される", async () => {
    mockGoogleClient.getUserInfo.mockResolvedValue({
      email: "u@example.com", id: "g1", name: "User", picture: null,
    })
    mockAuthAccountRepo.findByProvider.mockResolvedValue({
      user: { avatarUrl: null, bio: null, createdAt: new Date(), email: "u@example.com", id: 1, isOnboarded: true, name: "User", updatedAt: new Date() },
    })

    const result = await authenticateWithGoogle(
      { code: "c", redirectUri: "http://localhost:3000/api/auth/callback/google" },
      {
        authAccountRepository: mockAuthAccountRepo as never,
        refreshTokenRepository: mockRefreshTokenRepo as never,
        userRegistrationRepository: mockUserRegistrationRepo as never,
      },
      mockGoogleClient as never,
      mockGenerators
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isNewUser).toBe(false)
      expect(result.value.accessToken).toBe("access.jwt")
      expect(result.value.refreshToken).toBe("refresh.jwt")
    }
    expect(mockRefreshTokenRepo.save).toHaveBeenCalledWith("uuid-1", 1, expect.any(Number))
  })

  it("新規ユーザーは isNewUser=true でユーザーが作成される", async () => {
    mockGoogleClient.getUserInfo.mockResolvedValue({
      email: "n@example.com", id: "g2", name: "New", picture: "https://x/y.png",
    })
    mockAuthAccountRepo.findByProvider.mockResolvedValue(null)
    mockUserRegistrationRepo.createUserWithAuthAccountTx.mockResolvedValue({
      avatarUrl: "https://x/y.png", bio: null, createdAt: new Date(),
      email: "n@example.com", id: 42, isOnboarded: false, name: "New", updatedAt: new Date(),
    })

    const result = await authenticateWithGoogle(
      { code: "c", redirectUri: "http://localhost:3000/api/auth/callback/google" },
      {
        authAccountRepository: mockAuthAccountRepo as never,
        refreshTokenRepository: mockRefreshTokenRepo as never,
        userRegistrationRepository: mockUserRegistrationRepo as never,
      },
      mockGoogleClient as never,
      mockGenerators
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.isNewUser).toBe(true)
      expect(result.value.user.id).toBe(42)
    }
  })

  it("Google API が失敗したら例外が伝播する", async () => {
    mockGoogleClient.getUserInfo.mockRejectedValue(new Error("network"))

    await expect(
      authenticateWithGoogle(
        { code: "c", redirectUri: "http://localhost:3000/api/auth/callback/google" },
        {
          authAccountRepository: mockAuthAccountRepo as never,
          refreshTokenRepository: mockRefreshTokenRepo as never,
          userRegistrationRepository: mockUserRegistrationRepo as never,
        },
        mockGoogleClient as never,
        mockGenerators
      )
    ).rejects.toThrow()
  })
})
```

### Controller インテグレーションテスト

`apps/api/test/controller/auth/google.test.ts` を更新。`supertest` で POST を叩く。

```typescript
import request from "supertest"

import { AuthGoogleController } from "../../../src/controller/auth/google"
import { authRouter } from "../../../src/routes/auth-router"
import { attachErrorHandler, createTestApp, testPrisma } from "../helper"

describe("POST /api/auth/google", () => {
  const mockGoogleClient = {
    generateAuthUrl: jest.fn(),
    getUserInfo: jest.fn(),
  }
  const mockRefreshTokenRepo = { delete: jest.fn(), findUserId: jest.fn(), save: jest.fn() }

  const buildApp = () => {
    const app = createTestApp()
    const controller = new AuthGoogleController(
      // 実 DB の repository を使用
      // （helper で testPrisma から組み立てる関数を用意することを想定）
      // ...
    )
    app.use("/api/auth", authRouter({ google: controller }))
    attachErrorHandler(app)
    return app
  }

  beforeEach(async () => {
    await testPrisma.user.deleteMany()
    jest.clearAllMocks()
  })

  it("正常系: 新規ユーザーが作成され 200 が返る", async () => {
    mockGoogleClient.getUserInfo.mockResolvedValue({
      email: "i@example.com", id: "g-int", name: "Int", picture: null,
    })

    const res = await request(buildApp())
      .post("/api/auth/google")
      .send({ code: "abc", redirect_uri: "http://localhost:3000/api/auth/callback/google" })

    expect(res.status).toBe(200)
    expect(res.body.access_token).toBeDefined()
    expect(res.body.refresh_token).toBeDefined()
    expect(res.body.is_new_user).toBe(true)
    expect(res.body.user.id).toBeDefined()
  })

  it("異常系: code 欠落で 400 が返る", async () => {
    const res = await request(buildApp())
      .post("/api/auth/google")
      .send({ redirect_uri: "http://localhost:3000/api/auth/callback/google" })

    expect(res.status).toBe(400)
    expect(res.body.error).toBeDefined()
  })
})
```

### 手動疎通

```bash
cd apps/api && pnpm dev
```

別ターミナルから:

```bash
curl -X POST http://localhost:8080/api/auth/google \
  -H "Content-Type: application/json" \
  -d '{"code":"<google_auth_code>", "redirect_uri":"http://localhost:3000/api/auth/callback/google"}'
```

返却 JSON に `access_token` / `refresh_token` / `is_new_user` / `user` が含まれること。
