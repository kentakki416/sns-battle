import { z } from "zod"

// ========================================================
// GET /api/users/search - ユーザー検索
// ========================================================

/**
 * 検索結果の各エントリ（プロフィール一部を抜粋した軽量シェイプ）。
 * フォロー一覧と同じ shape だが、エンドポイントごとに独立した契約として定義する。
 */
export const searchUserSummarySchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  id: z.number().int().positive(),
  name: z.string().nullable(),
})

/**
 * GET /api/users/search のクエリパラメータ。
 * - `q`: 部分一致検索キーワード（name 列に ILIKE）。必須、1..100 文字
 * - `limit`: 1..100、未指定 20
 * - `cursor`: 前ページの末尾 user.id（id 降順カーソル）
 */
export const searchUsersQueryStringSchema = z.object({
  cursor: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().min(1).max(100),
})

/**
 * GET /api/users/search のレスポンス。
 * users は user.id 降順（新規ユーザー優先）。`next_cursor` は users が `limit` 件揃った場合のみ末尾 id を返す。
 */
export const searchUsersResponseSchema = z.object({
  next_cursor: z.number().int().positive().nullable(),
  users: z.array(searchUserSummarySchema),
})

export type SearchUserSummary = z.infer<typeof searchUserSummarySchema>
export type SearchUsersQueryString = z.infer<typeof searchUsersQueryStringSchema>
export type SearchUsersResponse = z.infer<typeof searchUsersResponseSchema>
