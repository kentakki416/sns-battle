import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

import { MatchingHero } from "./_components/MatchingHero"
import { WaitingUserGrid } from "./_components/WaitingUserGrid"

export const metadata: Metadata = {
  title: "マッチング | SNS Battle",
}

export default async function MatchingLobbyPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  /**
   * 初期版は空配列。将来 GET /api/matching/queue で取得する予定。
   * 本 step では SSE / API 取得を行わず、UI のレイアウトと「マッチング開始」CTA を確立する。
   */
  const waitingUsers: never[] = []

  return (
    <main className="relative mx-auto max-w-4xl p-6">
      <MatchingHero />
      <WaitingUserGrid users={waitingUsers} />
    </main>
  )
}
