import type { Metadata } from "next"
import { redirect } from "next/navigation"

import {
  getMatchingSessionResponseSchema,
  getReactionsResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { ResultActions } from "./_components/ResultActions"
import { ResultHeader } from "./_components/ResultHeader"
import { RoundList } from "./_components/RoundList"

export const metadata: Metadata = {
  title: "マッチング結果 | SNS Battle",
}

type Props = {
  searchParams: Promise<{ session_id?: string }>
}

export default async function MatchingResultPage({ searchParams }: Props) {
  const { session_id: sessionIdParam } = await searchParams
  const sessionId = Number(sessionIdParam)
  if (!Number.isInteger(sessionId) || sessionId <= 0) redirect("/matching")

  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const [sessionJson, reactionsJson] = await Promise.all([
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}`),
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}/reactions`),
  ])
  const session = getMatchingSessionResponseSchema.parse(sessionJson)
  const { rounds } = getReactionsResponseSchema.parse(reactionsJson)
  const peer = session.is_self_user1 ? session.user2 : session.user1
  const myParticipant = session.is_self_user1 ? session.user1 : session.user2
  const matchCount = rounds.filter((r) => r.is_match).length

  return (
    <div className="relative mx-auto max-w-lg px-6 py-8">
      {/**
       * 背景装飾。パープル + シアンの blur オーブを 2 個。
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-16 h-[400px] w-[400px] rounded-full opacity-30 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(203, 172, 249, 0.4), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-20 h-[500px] w-[500px] rounded-full opacity-25 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(14, 165, 233, 0.4), transparent 70%)" }}
      />

      <div className="relative">
        <ResultHeader
          matchCount={matchCount}
          me={myParticipant}
          peer={peer}
          totalRounds={rounds.length}
        />
        <RoundList rounds={rounds} />
        <ResultActions peerId={peer.id} />
      </div>
    </div>
  )
}
