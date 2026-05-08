import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getHobbiesResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { OnboardingForm } from "./_components/OnboardingForm"

export const metadata: Metadata = {
  title: "プロフィール設定 | SNS Battle",
}

export default async function OnboardingPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (me.is_onboarded) redirect("/")

  /**
   * 趣味マスターを Server Component で取得（同一リクエスト内キャッシュ済み）
   */
  const hobbiesJson = await apiClient.get<unknown>("/api/hobbies")
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <main className="flex min-h-screen items-start justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">はじめまして！</h1>
          <p className="mt-2 text-sm text-text-muted">プロフィールを設定しましょう</p>
        </header>

        <OnboardingForm
          hobbies={hobbies}
          initialAvatarUrl={me.avatar_url}
          initialName={me.name ?? ""}
          userId={me.id}
        />
      </div>
    </main>
  )
}
