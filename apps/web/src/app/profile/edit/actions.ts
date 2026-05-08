"use server"

import { redirect } from "next/navigation"

import type { UpdateUserRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type ProfileEditActionState = {
  error: string | null
}

/**
 * プロフィール更新の Server Action。
 * useActionState から第 2 引数以降が呼ばれる。userId は bind で前段に渡す。
 * 成功時は /profile/me にリダイレクト → /profile/{id} で最新プロフィールを表示。
 */
export const updateProfileAction = async (
  userId: number,
  _prevState: ProfileEditActionState,
  formData: FormData
): Promise<ProfileEditActionState> => {
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

  const body: UpdateUserRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as UpdateUserRequest["gender"],
    hobby_ids: hobbyIds,
    location: location.length > 0 ? location : null,
    mbti: mbti.length > 0 ? (mbti as UpdateUserRequest["mbti"]) : null,
    name,
  }

  try {
    await apiClient.put(`/api/users/${userId}`, body)
  } catch {
    return { error: "プロフィール更新に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/profile/me")
}
