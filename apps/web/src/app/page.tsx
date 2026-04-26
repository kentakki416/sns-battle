"use client"

import BattleCard from "@/components/features/battle-card"
import StreamCard from "@/components/features/stream-card"
import UserCard from "@/components/features/user-card"
import { mockBattles, mockStreams, mockUsers } from "@/libs/mock-data"

export default function HomePage() {
  const liveStreams = mockStreams.filter((s) => s.isLive)
  const liveBattles = mockBattles.filter((b) => b.status === "live")
  const waitingBattles = mockBattles.filter((b) => b.status === "waiting")

  return (
    <div className="relative space-y-10">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[120px]" />
        <div className="absolute -right-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-cyan/[0.03] blur-[120px]" />
      </div>

      {/* ライブ配信セクション */}
      <section className="relative">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-error/10">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error" />
          </div>
          <h2 className="text-lg font-bold text-text-primary">ライブ配信中</h2>
          <span className="rounded-md bg-white/[0.03] px-2 py-0.5 text-xs text-text-muted">
            {liveStreams.length}
          </span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {liveStreams.map((stream) => (
            <StreamCard key={stream.id} stream={stream} />
          ))}
        </div>
      </section>

      {/* 開催中のバトル */}
      <section className="relative">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-pink/10">
            <span className="text-sm">⚔️</span>
          </div>
          <h2 className="text-lg font-bold text-text-primary">開催中のバトル</h2>
          <span className="rounded-md bg-white/[0.03] px-2 py-0.5 text-xs text-text-muted">
            {liveBattles.length}
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {liveBattles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} />
          ))}
        </div>
      </section>

      {/* 対戦相手募集中 */}
      <section className="relative">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan/10">
            <span className="text-sm">🕐</span>
          </div>
          <h2 className="text-lg font-bold text-text-primary">対戦相手募集中</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {waitingBattles.map((battle) => (
            <BattleCard key={battle.id} battle={battle} />
          ))}
        </div>
      </section>

      {/* おすすめユーザー */}
      <section className="relative">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <span className="text-sm">✨</span>
          </div>
          <h2 className="text-lg font-bold text-text-primary">おすすめユーザー</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mockUsers.map((user) => (
            <UserCard key={user.id} user={user} />
          ))}
        </div>
      </section>
    </div>
  )
}
