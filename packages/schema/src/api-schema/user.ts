import { z } from "zod"

// ========================================================
// GET /api/users/:id - ユーザープロフィール取得
// ========================================================

/**
 * 共通の Gender enum
 */
export const genderSchema = z.enum(["MALE", "FEMALE", "OTHER"])
export type Gender = z.infer<typeof genderSchema>

/**
 * 共通の MBTI enum（16 タイプ）
 */
export const mbtiSchema = z.enum([
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
])
export type MbtiType = z.infer<typeof mbtiSchema>

/**
 * 趣味エントリ（プロフィールレスポンスに埋め込む形）
 */
export const hobbySchema = z.object({
  id: z.number().int(),
  name: z.string(),
})
export type Hobby = z.infer<typeof hobbySchema>

/**
 * GET /api/users/:id のパスパラメータ
 */
export const getUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * GET /api/users/:id のレスポンス
 * birth_date / coin_balance のみ is_self=true 時に値を返し、他人取得時は null。
 * mbti / location / hobbies は他人にも公開する（マッチング時の相性表示用）。
 */
export const getUserResponseSchema = z.object({
  age: z.number().int().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  /**
   * is_self=true 時のみ ISO 日付文字列（YYYY-MM-DD）、他人取得時は null
   */
  birth_date: z.string().nullable(),
  /**
   * is_self=true 時のみ数値、他人取得時は null
   */
  coin_balance: z.number().int().nullable(),
  created_at: z.string(),
  gender: genderSchema.nullable(),
  /**
   * 趣味は他人にも公開（hobby_master との JOIN 結果）
   */
  hobbies: z.array(hobbySchema),
  id: z.number().int(),
  is_onboarded: z.boolean(),
  is_self: z.boolean(),
  /**
   * 居住地域は他人にも公開
   */
  location: z.string().nullable(),
  /**
   * MBTI は他人にも公開
   */
  mbti: mbtiSchema.nullable(),
  name: z.string().nullable(),
})

export type GetUserPathParam = z.infer<typeof getUserPathParamSchema>
export type GetUserResponse = z.infer<typeof getUserResponseSchema>
