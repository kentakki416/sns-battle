import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { type ListRecommendedUsersResponse, listRecommendedUsersResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { HomeComingSoonCard } from "./_components/HomeComingSoonCard"
import { HomeSectionHeader } from "./_components/HomeSectionHeader"
import { RecommendedUserCard } from "./_components/RecommendedUserCard"

export const metadata: Metadata = {
  title: "ホーム | SNS Battle",
}

/**
 * ホームフィード（/）。
 *
 * 設計書（docs/spec/social/README.md）の 4 セクションを縦に並べる。
 * Phase 8 / 9 のテーブル（streams / battle_rooms）未投入のため、上 3 セクションは
 * 「準備中」プレースホルダを表示する。「おすすめユーザー」のみ /api/users/recommendations の実データを表示。
 */
export default async function HomePage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  /**
   * おすすめユーザーのみ取得失敗時にページ全体を落とさないよう try/catch でフォールバック空配列にする。
   */
  let recommendations: ListRecommendedUsersResponse = { users: [] }
  try {
    const json = await apiClient.get<unknown>("/api/users/recommendations?limit=12")
    recommendations = listRecommendedUsersResponseSchema.parse(json)
  } catch {
    recommendations = { users: [] }
  }

  return (
    <div className="relative space-y-10">
      <div
        aria-hidden
        className="pointer-events-none fixed -left-1/4 top-0 -z-10 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-1/4 bottom-0 -z-10 h-[400px] w-[400px] rounded-full bg-cyan/[0.03] blur-[120px]"
      />

      <section>
        <HomeSectionHeader
          badgeBgClass="bg-error/10"
          icon={<span className="h-2 w-2 rounded-full bg-error" aria-hidden />}
          title="ライブ配信中"
        />
        <HomeComingSoonCard message="配信機能は近日公開です" phase="Phase 8 で実装予定" />
      </section>

      <section>
        <HomeSectionHeader
          badgeBgClass="bg-accent-pink/10"
          icon={<span aria-hidden>⚔️</span>}
          title="開催中のバトル"
        />
        <HomeComingSoonCard message="バトル機能は近日公開です" phase="Phase 9 で実装予定" />
      </section>

      <section>
        <HomeSectionHeader
          badgeBgClass="bg-cyan/10"
          icon={<span aria-hidden>🕐</span>}
          title="対戦相手募集中"
        />
        <HomeComingSoonCard message="バトル募集機能は近日公開です" phase="Phase 9 で実装予定" />
      </section>

      <section>
        <HomeSectionHeader
          badgeBgClass="bg-primary/10"
          count={recommendations.users.length}
          icon={<span aria-hidden>✨</span>}
          title="おすすめユーザー"
        />
        {recommendations.users.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.02] p-6 text-center text-sm text-text-muted">
            おすすめできるユーザーがまだいません
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.users.map((user) => (
              <RecommendedUserCard key={user.id} user={user} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
