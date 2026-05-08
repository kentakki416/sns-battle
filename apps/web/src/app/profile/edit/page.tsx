import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getHobbiesResponseSchema, getUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { ProfileEditForm } from "./_components/ProfileEditForm"

export const metadata: Metadata = {
  title: "プロフィール編集 | SNS Battle",
}

export default async function ProfileEditPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const [profileJson, hobbiesJson] = await Promise.all([
    apiClient.get<unknown>(`/api/users/${me.id}`),
    apiClient.get<unknown>("/api/hobbies"),
  ])
  const profile = getUserResponseSchema.parse(profileJson)
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <div className="mx-auto max-w-md px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">プロフィール編集</h1>
        <p className="mt-1 text-sm text-text-muted">
          表示名・自己紹介・生年月日・性別・MBTI・居住地域・趣味を更新できます
        </p>
      </header>
      <ProfileEditForm hobbies={hobbies} profile={profile} userId={me.id} />
    </div>
  )
}
