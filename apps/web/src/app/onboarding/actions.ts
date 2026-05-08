"use server"

import { redirect } from "next/navigation"

import type { CompleteOnboardingRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type OnboardingActionState = {
  error: string | null
}

/**
 * オンボーディング完了の Server Action。
 * useActionState から第 2 引数以降が呼ばれる。userId は bind で前段に渡す。
 */
export const completeOnboardingAction = async (
  userId: number,
  _prevState: OnboardingActionState,
  formData: FormData
): Promise<OnboardingActionState> => {
  const name = formData.get("name")?.toString().trim() ?? ""
  const bio = formData.get("bio")?.toString().trim() ?? ""
  const birthDate = formData.get("birth_date")?.toString() ?? ""
  const gender = formData.get("gender")?.toString() ?? ""
  const mbti = formData.get("mbti")?.toString() ?? ""
  const location = formData.get("location")?.toString().trim() ?? ""
  const hobbyIds = formData.getAll("hobby_ids").map((v) => Number(v.toString()))

  if (!name || !birthDate || !gender) {
    return { error: "必須項目を入力してください" }
  }

  const body: CompleteOnboardingRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as CompleteOnboardingRequest["gender"],
    hobby_ids: hobbyIds.length > 0 ? hobbyIds : undefined,
    location: location.length > 0 ? location : null,
    mbti: mbti.length > 0 ? (mbti as CompleteOnboardingRequest["mbti"]) : null,
    name,
  }

  try {
    await apiClient.put(`/api/users/${userId}/onboarding`, body)
  } catch {
    return { error: "プロフィール登録に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/")
}
