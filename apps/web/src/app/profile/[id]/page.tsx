import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { type GetUserResponse, getUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { EmptyBattleStats } from "../_components/EmptyBattleStats"
import { EmptyStreamHistory } from "../_components/EmptyStreamHistory"
import { ProfileDetailSection } from "../_components/ProfileDetailSection"
import { ProfileHeaderCard } from "../_components/ProfileHeaderCard"

type Props = {
  params: Promise<{ id: string }>
}

export const metadata: Metadata = {
  title: "プロフィール | SNS Battle",
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  let profile: GetUserResponse
  try {
    const json = await apiClient.get<unknown>(`/api/users/${id}`)
    profile = getUserResponseSchema.parse(json)
  } catch {
    notFound()
  }

  return (
    <div className="relative mx-auto max-w-2xl px-6 py-10">
      <div
        aria-hidden
        className="pointer-events-none fixed -left-32 -top-32 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(203,172,249,0.08) 0%, transparent 70%)",
          filter: "blur(120px)",
        }}
      />

      <ProfileHeaderCard isMyProfile={profile.is_self} profile={profile} />

      <ProfileDetailSection profile={profile} />

      <section className="mt-8">
        <SectionHeader emoji="📺" title="ライブ配信履歴" tone="error" />
        <EmptyStreamHistory />
      </section>

      <section className="mt-8">
        <SectionHeader emoji="⚔️" title="バトル戦績" tone="pink" />
        <EmptyBattleStats />
      </section>
    </div>
  )
}

function SectionHeader({
  emoji,
  title,
  tone,
}: {
  emoji: string
  title: string
  tone: "error" | "pink"
}) {
  const bg = tone === "error" ? "bg-error/10" : "bg-accent-pink/10"
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}>{emoji}</span>
      {title}
    </h2>
  )
}
