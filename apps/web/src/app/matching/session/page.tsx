import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

import { MatchingSession } from "./_components/MatchingSession"

export const metadata: Metadata = {
  title: "マッチングセッション | SNS Battle",
}

export default async function MatchingSessionPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  return <MatchingSession meMbti={me.mbti} userId={me.id} />
}
