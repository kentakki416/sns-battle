import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

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

/**
 * apiClient はエラー時に `Error("API error: <status>")` を投げる。Server Component で
 * Next.js の `notFound()` / `redirect()` に変換できるよう、メッセージから status を抽出する。
 * apiClient 自体に typed error を持たせる方が綺麗だが、影響範囲が広いため本ページではインラインで処理する。
 */
const extractApiStatus = (e: unknown): number | null => {
  if (!(e instanceof Error)) return null
  const m = /^API error: (\d+)$/.exec(e.message)
  return m ? Number(m[1]) : null
}

export default async function MatchingResultPage({ searchParams }: Props) {
  const { session_id: sessionIdParam } = await searchParams
  const sessionId = Number(sessionIdParam)
  if (!Number.isInteger(sessionId) || sessionId <= 0) redirect("/matching")

  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  /**
   * 存在しないセッション / 非参加者の場合は API が 404 / 403 を返すので、Next.js の
   * 404 ページや /matching リダイレクトに振り替える。`Promise.all` のままだと一方の失敗で
   * もう一方がキャンセルされないため `allSettled` で個別にチェックする。
   */
  const [sessionResult, reactionsResult] = await Promise.allSettled([
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}`),
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}/reactions`),
  ])

  for (const r of [sessionResult, reactionsResult]) {
    if (r.status === "rejected") {
      const status = extractApiStatus(r.reason)
      if (status === 404 || status === 410) notFound()
      if (status === 403) redirect("/matching")
      throw r.reason
    }
  }

  /** allSettled の戻り値を narrow するため fulfilled を assert で取り出す */
  const sessionJson = (sessionResult as PromiseFulfilledResult<unknown>).value
  const reactionsJson = (reactionsResult as PromiseFulfilledResult<unknown>).value
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
