import { z } from "zod"

/**
 * エラーレスポンススキーマ（全エンドポイント共通）
 */
export const errorResponseSchema = z.object({
  error: z.string(),
  status_code: z.number(),
})

export type ErrorResponse = z.infer<typeof errorResponseSchema>

export * from "./auth"
export * from "./health"
export * from "./memo"
export * from "./user"