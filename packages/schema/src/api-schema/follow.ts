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

export type FollowUserPathParam = z.infer<typeof followUserPathParamSchema>
export type FollowUserResponse = z.infer<typeof followUserResponseSchema>
export type UnfollowUserPathParam = z.infer<typeof unfollowUserPathParamSchema>
export type UnfollowUserResponse = z.infer<typeof unfollowUserResponseSchema>
