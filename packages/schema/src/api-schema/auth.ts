import { z } from "zod"

// ========================================================
// POST /api/auth/google - Google OAuth 認証コードの検証
// ========================================================

/**
 * Google OAuth 認証リクエストのスキーマ
 * Next.js 側で取得した Authorization Code と、リダイレクト時に使用した
 * redirect_uri を受け取り、API が token 交換 + UserInfo 取得を行う。
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

// ========================================================
// GET /api/auth/me
// ========================================================

/**
 * ユーザー情報取得のレスポンススキーマ
 *
 * mbti を返す理由: マッチング成立画面（/matching/session）で相性スコアを即時表示するため、
 * 認証ユーザー自身の MBTI もクライアントへ提供する。他人のプロフィールには既に mbti が含まれる。
 */
export const authMeResponseSchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  email: z.string().nullable(),
  id: z.number(),
  is_onboarded: z.boolean(),
  mbti: z.string().nullable(),
  name: z.string().nullable(),
  created_at: z.string(),
})

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>

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
