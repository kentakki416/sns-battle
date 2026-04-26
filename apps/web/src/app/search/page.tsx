"use client"

import { useState } from "react"

import BattleCard from "@/components/features/battle-card"
import StreamCard from "@/components/features/stream-card"
import UserCard from "@/components/features/user-card"
import { mockBattles, mockStreams, mockUsers } from "@/libs/mock-data"

type TabKey = "all" | "streams" | "users" | "battles"

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "streams", label: "配信" },
  { key: "users", label: "ユーザー" },
  { key: "battles", label: "バトル" },
]

export default function SearchPage() {
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  const hasQuery = query.trim().length > 0

  return (
    <div className="relative">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[150px]" />
        <div className="absolute right-1/4 bottom-1/4 h-[400px] w-[400px] rounded-full bg-cyan/[0.03] blur-[120px]" />
      </div>

      {/* 検索バー */}
      <div className="relative mb-6">
        <div className="relative">
          <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-disabled">🔍</span>
          <input
            autoFocus
            className="w-full rounded-2xl border border-white/[0.08] bg-dark-surface/50 px-4 py-4 pl-12 text-text-primary placeholder-text-muted backdrop-blur-sm transition-all focus:border-primary/40 focus:shadow-[0_0_20px_rgba(203,172,249,0.08)] focus:outline-none"
            placeholder="配信・ユーザー・バトルを検索..."
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {/* タブ */}
      <div className="glass-card relative mb-6 flex gap-1 rounded-xl p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              activeTab === tab.key
                ? "bg-gradient-to-r from-primary to-cyan text-dark-base shadow-[0_0_12px_rgba(203,172,249,0.15)]"
                : "text-text-muted hover:text-text-primary"
            }`}
            type="button"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 検索結果 */}
      {!hasQuery ? (
        <div className="py-24 text-center">
          <p className="text-4xl">🔍</p>
          <p className="mt-3 text-text-disabled">キーワードを入力して検索してください</p>
        </div>
      ) : (
        <div className="relative space-y-8">
          {(activeTab === "all" || activeTab === "streams") && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-text-muted">📺 配信</h2>
              <div className="flex gap-4 overflow-x-auto pb-2">
                {mockStreams.slice(0, 3).map((stream) => (
                  <StreamCard key={stream.id} stream={stream} />
                ))}
              </div>
            </section>
          )}

          {(activeTab === "all" || activeTab === "users") && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-text-muted">👤 ユーザー</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {mockUsers.slice(0, 4).map((user) => (
                  <UserCard key={user.id} user={user} />
                ))}
              </div>
            </section>
          )}

          {(activeTab === "all" || activeTab === "battles") && (
            <section>
              <h2 className="mb-3 text-sm font-semibold text-text-muted">⚔️ バトル</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {mockBattles.slice(0, 3).map((battle) => (
                  <BattleCard key={battle.id} battle={battle} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
