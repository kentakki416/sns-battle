import { z } from "zod"

import { genderSchema, mbtiSchema } from "./user"

// ========================================================
// GET /api/matching/preferences - フィルタ取得
// ========================================================

/**
 * マッチングフィルタの共通スキーマ。
 * 配列カラムは「空配列 = 制限なし」、age_min / age_max は null = 制限なし。
 */
export const matchingPreferenceSchema = z.object({
  age_max: z.number().int().nullable(),
  age_min: z.number().int().nullable(),
  preferred_genders: z.array(genderSchema),
  preferred_hobby_ids: z.array(z.number().int().positive()),
  preferred_locations: z.array(z.string()),
  preferred_mbti: z.array(mbtiSchema),
})

/**
 * GET /api/matching/preferences のレスポンス。
 * レコード未作成のユーザーにはデフォルト値（全配列空、age_min/max=null）が返る。
 */
export const getMatchingPreferenceResponseSchema = matchingPreferenceSchema

// ========================================================
// PUT /api/matching/preferences - フィルタ更新（upsert）
// ========================================================

/**
 * PUT /api/matching/preferences のリクエストボディ。
 * 全フィールド必須（空配列 / null で「制限なし」を表現）。
 */
export const updateMatchingPreferenceRequestSchema = z.object({
  age_max: z.number().int().min(18).max(120).nullable(),
  age_min: z.number().int().min(18).max(120).nullable(),
  preferred_genders: z.array(genderSchema).max(3),
  preferred_hobby_ids: z.array(z.number().int().positive()).max(20),
  preferred_locations: z.array(z.string().max(100)).max(20),
  preferred_mbti: z.array(mbtiSchema).max(16),
})

/**
 * PUT /api/matching/preferences のレスポンス（GET と同形式）
 */
export const updateMatchingPreferenceResponseSchema = matchingPreferenceSchema

export type MatchingPreference = z.infer<typeof matchingPreferenceSchema>
export type GetMatchingPreferenceResponse = z.infer<typeof getMatchingPreferenceResponseSchema>
export type UpdateMatchingPreferenceRequest = z.infer<typeof updateMatchingPreferenceRequestSchema>
export type UpdateMatchingPreferenceResponse = z.infer<typeof updateMatchingPreferenceResponseSchema>
