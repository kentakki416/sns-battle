"use server"

import { redirect } from "next/navigation"

import type { UpdateMatchingPreferenceRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type PreferenceActionState = {
  error: string | null
}

/**
 * 空欄 / 非数値は null として扱う（API では「制限なし」を意味する）。
 */
const parseAge = (raw: string | undefined): number | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n)) return null
  return n
}

/**
 * マッチングフィルタ更新の Server Action。
 * 自分のフィルタを upsert するだけなので userId の bind は不要。
 * 成功時は /profile/me にリダイレクト。
 */
export const updatePreferenceAction = async (
  _prevState: PreferenceActionState,
  formData: FormData
): Promise<PreferenceActionState> => {
  const ageMin = parseAge(formData.get("age_min")?.toString())
  const ageMax = parseAge(formData.get("age_max")?.toString())
  const preferredGenders = formData.getAll("preferred_genders").map((v) => v.toString())
  const preferredLocations = formData
    .getAll("preferred_locations")
    .map((v) => v.toString().trim())
    .filter((v) => v.length > 0)
  const preferredMbti = formData.getAll("preferred_mbti").map((v) => v.toString())
  const preferredHobbyIds = formData
    .getAll("preferred_hobby_ids")
    .map((v) => Number(v.toString()))

  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    return { error: "最小年齢は最大年齢以下にしてください" }
  }

  const body: UpdateMatchingPreferenceRequest = {
    age_max: ageMax,
    age_min: ageMin,
    preferred_genders: preferredGenders as UpdateMatchingPreferenceRequest["preferred_genders"],
    preferred_hobby_ids: preferredHobbyIds,
    preferred_locations: preferredLocations,
    preferred_mbti: preferredMbti as UpdateMatchingPreferenceRequest["preferred_mbti"],
  }

  try {
    await apiClient.put("/api/matching/preferences", body)
  } catch {
    return { error: "フィルタ設定の保存に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/profile/me")
}
