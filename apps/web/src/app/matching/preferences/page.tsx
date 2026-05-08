import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  getHobbiesResponseSchema,
  getMatchingPreferenceResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { PreferenceForm } from "./_components/PreferenceForm"

export const metadata: Metadata = {
  title: "マッチングフィルタ | SNS Battle",
}

export default async function MatchingPreferencesPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const [preferenceJson, hobbiesJson] = await Promise.all([
    apiClient.get<unknown>("/api/matching/preferences"),
    apiClient.get<unknown>("/api/hobbies"),
  ])
  const preference = getMatchingPreferenceResponseSchema.parse(preferenceJson)
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">マッチングフィルタ設定</h1>
        <p className="mt-1 text-sm text-text-muted">
          条件に当てはまるユーザーのみマッチング候補に出ます。すべて空欄のままなら制限なし
        </p>
      </header>

      <PreferenceForm hobbies={hobbies} preference={preference} />
    </div>
  )
}
