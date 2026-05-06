# step4-web-auth-callback.md

Next.js 側で Google OAuth フローを完成させる。Server Action で OAuth URL を生成し、Google からのコールバックを Route Handler で受け取り、Express の `POST /api/auth/google` を呼んで Cookie にトークンを保存する。さらに `middleware.ts` で未ログインユーザーを `/sign-in` にリダイレクトする。

UI（`/sign-in` ページのレンダリング）は step5 に分離。本 step は **認証フローの配線のみ**。

## 対応内容

### 環境変数

`apps/web/.env.local`（dotenvx 暗号化）に追加。

```bash
cd apps/web
npx dotenvx set GOOGLE_CLIENT_ID "..." -f .env.local
npx dotenvx set GOOGLE_CLIENT_SECRET "..." -f .env.local
npx dotenvx set NEXT_PUBLIC_APP_URL "http://localhost:3000" -f .env.local
npx dotenvx set API_URL "http://localhost:8080" -f .env.local
```

`apps/api/.env.local` の `GOOGLE_CALLBACK_URL` は **`http://localhost:3000/api/auth/callback/google`** に変更する（Next.js が受け取るため）。

### Cookie 名・ヘルパーの定義

`apps/web/src/libs/auth.ts` を新規作成する。HttpOnly + Secure + SameSite=Strict（本番）で Cookie に保存する。

```typescript
import { cookies } from "next/headers"

export const ACCESS_TOKEN_COOKIE = "sb_access_token"
export const REFRESH_TOKEN_COOKIE = "sb_refresh_token"
export const OAUTH_STATE_COOKIE = "sb_oauth_state"

const isProduction = process.env.NODE_ENV === "production"

export const setAuthCookies = async (accessToken: string, refreshToken: string) => {
  const store = await cookies()
  store.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    maxAge: 60 * 15,
    path: "/",
    sameSite: "strict",
    secure: isProduction,
  })
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
    sameSite: "strict",
    secure: isProduction,
  })
}

export const clearAuthCookies = async () => {
  const store = await cookies()
  store.delete(ACCESS_TOKEN_COOKIE)
  store.delete(REFRESH_TOKEN_COOKIE)
}

export const getAccessToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(ACCESS_TOKEN_COOKIE)?.value ?? null
}

export const getRefreshToken = async (): Promise<string | null> => {
  const store = await cookies()
  return store.get(REFRESH_TOKEN_COOKIE)?.value ?? null
}
```

### `apiClient` の拡張

`apps/web/src/libs/api-client.ts` に Authorization ヘッダー対応 + 401 時の自動 refresh を追加する。Server Component / Server Action / Route Handler から使うことを想定。

```typescript
import { getAccessToken, getRefreshToken, setAuthCookies, clearAuthCookies } from "./auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

const buildHeaders = async (extra?: HeadersInit): Promise<HeadersInit> => {
  const token = await getAccessToken()
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "Content-Type": "application/json",
    ...extra,
  }
}

const tryRefresh = async (): Promise<boolean> => {
  const refreshToken = await getRefreshToken()
  if (!refreshToken) return false
  const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
    body: JSON.stringify({ refresh_token: refreshToken }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })
  if (!res.ok) {
    await clearAuthCookies()
    return false
  }
  const json = await res.json() as { access_token: string; refresh_token: string }
  await setAuthCookies(json.access_token, json.refresh_token)
  return true
}

const fetchWithAuth = async (input: string, init: RequestInit, retry = true): Promise<Response> => {
  const headers = await buildHeaders(init.headers)
  const res = await fetch(`${API_BASE_URL}${input}`, { ...init, headers })
  if (res.status === 401 && retry) {
    const refreshed = await tryRefresh()
    if (refreshed) return fetchWithAuth(input, init, false)
  }
  return res
}

export const apiClient = {
  delete: async <T = unknown>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "DELETE" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  get: async <T>(path: string): Promise<T> => {
    const res = await fetchWithAuth(path, { method: "GET" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "POST" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
  put: async <T>(path: string, body: unknown): Promise<T> => {
    const res = await fetchWithAuth(path, { body: JSON.stringify(body), method: "PUT" })
    if (!res.ok) throw new Error(`API error: ${res.status}`)
    return res.json() as Promise<T>
  },
}
```

### Server Action: Google OAuth URL 生成

`apps/web/src/app/sign-in/actions.ts` を新規作成する。

```typescript
"use server"

import { randomBytes } from "node:crypto"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { OAUTH_STATE_COOKIE } from "@/libs/auth"

const isProduction = process.env.NODE_ENV === "production"

export const startGoogleOAuth = async () => {
  const state = randomBytes(16).toString("hex")
  const store = await cookies()
  store.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 60 * 5,
    path: "/",
    sameSite: "lax",
    secure: isProduction,
  })

  const params = new URLSearchParams({
    access_type: "offline",
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
  })
  redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
}
```

`sameSite: "lax"` は Google からのトップレベルリダイレクトで Cookie が送信されるよう緩める（state の照合のみに使うため攻撃対象は限定的）。

### Route Handler: Google からのコールバック受信

`apps/web/src/app/api/auth/callback/google/route.ts` を新規作成する。

```typescript
import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

import { authGoogleResponseSchema } from "@repo/api-schema"

import { OAUTH_STATE_COOKIE, setAuthCookies } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

export const GET = async (req: NextRequest) => {
  const url = new URL(req.url)
  const code = url.searchParams.get("code")
  const state = url.searchParams.get("state")
  const errorParam = url.searchParams.get("error")

  if (errorParam) {
    return NextResponse.redirect(new URL("/sign-in?error=oauth_denied", req.url))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/sign-in?error=invalid_request", req.url))
  }

  const store = await cookies()
  const expected = store.get(OAUTH_STATE_COOKIE)?.value
  store.delete(OAUTH_STATE_COOKIE)

  if (!expected || expected !== state) {
    return NextResponse.redirect(new URL("/sign-in?error=state_mismatch", req.url))
  }

  const apiRes = await fetch(`${API_BASE_URL}/api/auth/google`, {
    body: JSON.stringify({
      code,
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback/google`,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  })

  if (!apiRes.ok) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_failed", req.url))
  }

  const json = authGoogleResponseSchema.parse(await apiRes.json())
  await setAuthCookies(json.access_token, json.refresh_token)

  const next = json.user.is_onboarded ? "/" : "/onboarding"
  return NextResponse.redirect(new URL(next, req.url))
}
```

### Server Action: ログアウト

`apps/web/src/app/(authed)/actions.ts` または共通ディレクトリに `logoutAction` を作成する。本プロジェクトの規約では「対応するページと同じディレクトリに actions.ts を配置」だが、ログアウトは複数ページから呼ばれるため `apps/web/src/libs/auth-actions.ts` に置く。

```typescript
"use server"

import { redirect } from "next/navigation"

import { apiClient } from "./api-client"
import { clearAuthCookies, getRefreshToken } from "./auth"

export const logoutAction = async () => {
  const refreshToken = await getRefreshToken()
  if (refreshToken) {
    try {
      await apiClient.post("/api/auth/logout", { refresh_token: refreshToken })
    } catch {
      /** API 失敗時も Cookie はクリアする */
    }
  }
  await clearAuthCookies()
  redirect("/sign-in")
}
```

### `getCurrentUser` ヘルパー

Server Component から現在のユーザーを取得するためのヘルパーを `apps/web/src/libs/current-user.ts` に作成する。

```typescript
import { cache } from "react"

import { authMeResponseSchema, type AuthMeResponse } from "@repo/api-schema"

import { apiClient } from "./api-client"

export const getCurrentUser = cache(async (): Promise<AuthMeResponse | null> => {
  try {
    const json = await apiClient.get<unknown>("/api/auth/me")
    return authMeResponseSchema.parse(json)
  } catch {
    return null
  }
})
```

`cache()` で同一リクエスト内の重複呼び出しをまとめる。

### middleware.ts: 未ログイン時のリダイレクト

`apps/web/src/middleware.ts` を新規作成する。Edge ランタイムで動くため、JWT 検証は行わず **Cookie の有無のみ** で判断する（実検証は API 側で行う）。

```typescript
import { NextRequest, NextResponse } from "next/server"

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/libs/auth"

const PUBLIC_PATHS = [
  "/sign-in",
  "/api/auth/callback/google",
]

export const middleware = (req: NextRequest) => {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const hasAccess = req.cookies.has(ACCESS_TOKEN_COOKIE)
  const hasRefresh = req.cookies.has(REFRESH_TOKEN_COOKIE)

  if (!hasAccess && !hasRefresh) {
    const url = new URL("/sign-in", req.url)
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /** _next, _next/static, _next/image, favicon, public 配下を除外 */
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
```

`hasRefresh` だけでも入場を許可している理由: Server Component 側で `apiClient` が 401 → refresh → 再試行する設計のため、access が切れている状態で middleware で蹴ると refresh の機会が失われる。

## 動作確認

### ユニットテスト

Next.js のサーバー側ロジックは Jest で動かしにくいため本 step では割愛し、step5 完成後に E2E（Playwright）で確認する。

### 手動確認手順

1. `apps/api` と `apps/web` を `pnpm dev` で起動
2. ブラウザで `http://localhost:3000/sign-in` にアクセス（step5 で UI 完成後）
3. 「Google でサインイン」をクリック → Google 認証画面 → 同意
4. `http://localhost:3000/api/auth/callback/google?code=...&state=...` に戻る
5. 期待動作:
   - 新規ユーザー: `/onboarding` にリダイレクト
   - 既存ユーザー: `/` にリダイレクト
6. ブラウザの Application タブで `sb_access_token` / `sb_refresh_token` Cookie が `HttpOnly` で保存されていることを確認
7. `/sign-in` 以外のページに直接アクセス → リダイレクトされないこと
8. Cookie を削除 → `/` にアクセス → `/sign-in?redirect=/` にリダイレクトされること

### state mismatch / OAuth エラーの動作

- Cookie の `sb_oauth_state` を手動で書き換えてから戻る → `/sign-in?error=state_mismatch`
- Google 認証画面で「キャンセル」 → `/sign-in?error=oauth_denied`

### Refresh の動作確認

1. ブラウザで一度ログイン
2. `sb_access_token` Cookie のみ削除（`sb_refresh_token` は残す）
3. 任意の認証必須ページをリロード → 自動で refresh が走り、ページが正常表示されること
4. ネットワークタブで `/api/auth/refresh` が 200 を返していること
