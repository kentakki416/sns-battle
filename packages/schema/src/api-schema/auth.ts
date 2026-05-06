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
 */
export const authMeResponseSchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  email: z.string().nullable(),
  id: z.number(),
  is_onboarded: z.boolean(),
  name: z.string().nullable(),
  created_at: z.string(),
})

export type AuthMeResponse = z.infer<typeof authMeResponseSchema>
