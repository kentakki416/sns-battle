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

// ========================================================
// PUT /api/users/:id - プロフィール更新
// ========================================================

/**
 * PUT /api/users/:id のパスパラメータ
 */
export const updateUserPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * PUT /api/users/:id のリクエストボディ。
 * すべて optional。指定されたフィールドのみ更新する。
 * hobby_ids は配列を渡すと、その内容で完全置換（指定外は削除）。
 * mbti は null 指定で解除、未指定なら現状維持。
 */
export const updateUserRequestSchema = z.object({
  avatar_url: z.string().url().nullable().optional(),
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  gender: genderSchema.optional(),
  hobby_ids: z.array(z.number().int().positive()).max(20).optional(),
  location: z.string().max(100).nullable().optional(),
  mbti: mbtiSchema.nullable().optional(),
  name: z.string().min(1).max(30).optional(),
})

/**
 * レスポンスは getUserResponse と同形式
 */
export const updateUserResponseSchema = getUserResponseSchema

export type UpdateUserPathParam = z.infer<typeof updateUserPathParamSchema>
export type UpdateUserRequest = z.infer<typeof updateUserRequestSchema>
export type UpdateUserResponse = z.infer<typeof updateUserResponseSchema>

// ========================================================
// PUT /api/users/:id/onboarding - オンボーディング完了
// ========================================================

/**
 * PUT /api/users/:id/onboarding のパスパラメータ
 */
export const completeOnboardingPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * オンボーディング完了 API のリクエストボディ。
 * 必須: name / birth_date / gender。
 * 任意: bio / mbti / location / hobby_ids（オンボーディング時に未入力でも OK）。
 */
export const completeOnboardingRequestSchema = z.object({
  bio: z.string().max(500).nullable().optional(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  gender: genderSchema,
  hobby_ids: z.array(z.number().int().positive()).max(20).optional(),
  location: z.string().max(100).nullable().optional(),
  mbti: mbtiSchema.nullable().optional(),
  name: z.string().min(1).max(30),
})

/**
 * レスポンスは getUserResponse と同形式
 */
export const completeOnboardingResponseSchema = getUserResponseSchema

export type CompleteOnboardingPathParam = z.infer<typeof completeOnboardingPathParamSchema>
export type CompleteOnboardingRequest = z.infer<typeof completeOnboardingRequestSchema>
export type CompleteOnboardingResponse = z.infer<typeof completeOnboardingResponseSchema>
