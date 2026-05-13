import { z } from "zod"

// ========================================================
// GET /api/users/recommendations - おすすめユーザー
// ========================================================

/**
 * おすすめユーザーの各エントリ。フォロワー数を併せて返却する点だけが follow / search 結果と異なる。
 */
export const recommendedUserSummarySchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  follower_count: z.number().int().nonnegative(),
  id: z.number().int().positive(),
  name: z.string().nullable(),
})

/**
 * GET /api/users/recommendations のクエリパラメータ。
 * - `limit`: 1..50、未指定 12（ホームの 1 グリッド分を想定）
 *
 * ページネーションは持たない。「おすすめ」は上位 N 件以外は返さない仕様。
 */
export const listRecommendedUsersQueryStringSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(12),
})

/**
 * GET /api/users/recommendations のレスポンス。
 *
 * 並び順:
 * - フォロワー数 降順
 * - 同数の場合は user.id 昇順（古いアカウント優先 / 安定ソート用）
 *
 * 除外条件:
 * - 認証ユーザー自身
 * - 認証ユーザーがフォロー済みのユーザー
 * - 認証ユーザーと双方向ブロック関係にあるユーザー
 * - オンボーディング未完了ユーザー
 */
export const listRecommendedUsersResponseSchema = z.object({
  users: z.array(recommendedUserSummarySchema),
})

export type ListRecommendedUsersQueryString = z.infer<typeof listRecommendedUsersQueryStringSchema>
export type ListRecommendedUsersResponse = z.infer<typeof listRecommendedUsersResponseSchema>
export type RecommendedUserSummary = z.infer<typeof recommendedUserSummarySchema>
