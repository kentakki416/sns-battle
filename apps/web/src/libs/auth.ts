import { cookies } from "next/headers"

export const ACCESS_TOKEN_COOKIE = "sb_access_token"
export const REFRESH_TOKEN_COOKIE = "sb_refresh_token"
export const OAUTH_STATE_COOKIE = "sb_oauth_state"
export const OAUTH_REDIRECT_COOKIE = "sb_oauth_redirect"

/**
 * オープンリダイレクト対策：自オリジン内の相対パスのみ許可する。
 * - "/" で始まること（プロトコル相対 "//evil.com" は拒否するため "/" 直後の "/" も拒否）
 * - URL として解釈可能なこと
 */
export const sanitizeRedirectPath = (raw: string | null | undefined): string | null => {
  if (!raw) return null
  if (!raw.startsWith("/") || raw.startsWith("//")) return null
  try {
    /** dummy origin を当てて URL コンストラクタで検証（同一オリジン相対なら成功） */
    const u = new URL(raw, "http://localhost")
    return u.pathname + u.search + u.hash
  } catch {
    return null
  }
}

const isProduction = process.env.NODE_ENV === "production"

const ACCESS_TOKEN_MAX_AGE = 60 * 15
const REFRESH_TOKEN_MAX_AGE = 60 * 60 * 24 * 7

export const setAuthCookies = async (accessToken: string, refreshToken: string) => {
  const store = await cookies()
  store.set(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    maxAge: ACCESS_TOKEN_MAX_AGE,
    path: "/",
    sameSite: "strict",
    secure: isProduction,
  })
  store.set(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    maxAge: REFRESH_TOKEN_MAX_AGE,
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
