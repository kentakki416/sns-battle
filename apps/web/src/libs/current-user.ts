import { cache } from "react"

import { authMeResponseSchema, type AuthMeResponse } from "@repo/api-schema"

import { apiClient } from "./api-client"

/**
 * 現在ログイン中のユーザー情報を取得する Server Component 用ヘルパー
 * 同一リクエスト内の重複呼び出しを cache() でまとめる
 * 未ログイン時や API エラー時は null を返す
 */
export const getCurrentUser = cache(async (): Promise<AuthMeResponse | null> => {
  try {
    const json = await apiClient.get<unknown>("/api/auth/me")
    return authMeResponseSchema.parse(json)
  } catch {
    return null
  }
})
