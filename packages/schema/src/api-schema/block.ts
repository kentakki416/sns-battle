import { z } from "zod"

// ========================================================
// POST /api/users/:id/block - ブロック
// ========================================================

/**
 * ブロックの路径パラメータ（ブロック対象のユーザー id）。
 */
export const blockUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/users/:id/block のレスポンス。冪等化はしないため、成功時は新規 block row の作成を意味する。
 * 副作用として双方向の follow row は削除される（spec: 「既存フォロー関係を双方向で削除」）。
 */
export const blockUserResponseSchema = z.object({
  blocked_id: z.number().int().positive(),
  blocker_id: z.number().int().positive(),
})

// ========================================================
// DELETE /api/users/:id/block - ブロック解除
// ========================================================

export const unblockUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * DELETE /api/users/:id/block のレスポンス。
 * 元々ブロックしていない場合でも 200 で OK（冪等）。
 */
export const unblockUserResponseSchema = z.object({
  message: z.string(),
})

export type BlockUserPathParam = z.infer<typeof blockUserPathParamSchema>
export type BlockUserResponse = z.infer<typeof blockUserResponseSchema>
export type UnblockUserPathParam = z.infer<typeof unblockUserPathParamSchema>
export type UnblockUserResponse = z.infer<typeof unblockUserResponseSchema>
