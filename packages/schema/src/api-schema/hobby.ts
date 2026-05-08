import { z } from "zod"

// ========================================================
// GET /api/hobbies - 趣味マスター一覧
// ========================================================

/**
 * 趣味マスター 1 件
 */
export const hobbyMasterSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  sort_order: z.number().int(),
})

/**
 * 趣味マスター一覧のレスポンス。is_active=true のみ sort_order 昇順で返す。
 */
export const getHobbiesResponseSchema = z.object({
  hobbies: z.array(hobbyMasterSchema),
})

export type HobbyMaster = z.infer<typeof hobbyMasterSchema>
export type GetHobbiesResponse = z.infer<typeof getHobbiesResponseSchema>
