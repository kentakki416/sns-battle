import { z } from "zod"

// ========================================================
// POST /api/users/:id/follow - フォロー
// ========================================================

/**
 * フォローの路径パラメータ（フォロー対象のユーザー id）。
 */
export const followUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/users/:id/follow のレスポンス。冪等化はしないため、成功時は新規 follow row の作成を意味する。
 */
export const followUserResponseSchema = z.object({
  followee_id: z.number().int().positive(),
  follower_id: z.number().int().positive(),
})

// ========================================================
// DELETE /api/users/:id/follow - フォロー解除
// ========================================================

export const unfollowUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * DELETE /api/users/:id/follow のレスポンス。
 * 元々フォローしていない場合でも 200 で OK（冪等）。
 */
export const unfollowUserResponseSchema = z.object({
  message: z.string(),
})

// ========================================================
// GET /api/users/:id/followers - フォロワー一覧
// GET /api/users/:id/following - フォロー中一覧
// ========================================================

/**
 * フォロー一覧の各エントリ（プロフィール一部を抜粋した軽量シェイプ）。
 * 完全プロフィールは `/api/users/:id` 個別取得で利用する。
 */
export const followUserSummarySchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  id: z.number().int().positive(),
  name: z.string().nullable(),
})

/**
 * GET /api/users/:id/followers / following 共通のパスパラメータ。
 */
export const listFollowersPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const listFollowingPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 一覧取得時のページネーション用クエリ。
 * - `limit`: 1..100、未指定 20
 * - `cursor`: 前ページの末尾 follow.id。降順カーソルなので、続きを取る時はこの id 未満を返す
 */
export const listFollowersQueryStringSchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

export const listFollowingQueryStringSchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

/**
 * GET /api/users/:id/followers のレスポンス。
 * users は follow.id 降順（新しくフォローした人が先頭）で返す。
 * `next_cursor` は users が `limit` 件揃った場合のみ末尾 follow.id を返す、それ未満なら null。
 */
export const listFollowersResponseSchema = z.object({
  next_cursor: z.number().int().positive().nullable(),
  users: z.array(followUserSummarySchema),
})

export const listFollowingResponseSchema = z.object({
  next_cursor: z.number().int().positive().nullable(),
  users: z.array(followUserSummarySchema),
})

export type FollowUserPathParam = z.infer<typeof followUserPathParamSchema>
export type FollowUserResponse = z.infer<typeof followUserResponseSchema>
export type FollowUserSummary = z.infer<typeof followUserSummarySchema>
export type ListFollowersPathParam = z.infer<typeof listFollowersPathParamSchema>
export type ListFollowersQueryString = z.infer<typeof listFollowersQueryStringSchema>
export type ListFollowersResponse = z.infer<typeof listFollowersResponseSchema>
export type ListFollowingPathParam = z.infer<typeof listFollowingPathParamSchema>
export type ListFollowingQueryString = z.infer<typeof listFollowingQueryStringSchema>
export type ListFollowingResponse = z.infer<typeof listFollowingResponseSchema>
export type UnfollowUserPathParam = z.infer<typeof unfollowUserPathParamSchema>
export type UnfollowUserResponse = z.infer<typeof unfollowUserResponseSchema>
