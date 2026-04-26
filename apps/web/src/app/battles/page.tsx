"use client"

import { useState } from "react"

import BattleCard from "@/components/features/battle-card"
import { mockBattles } from "@/libs/mock-data"

type TabKey = "all" | "live" | "waiting"

const tabs: { key: TabKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "live", label: "開催中" },
  { key: "waiting", label: "募集中" },
]

export default function BattlesPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("all")

  const filteredBattles = mockBattles.filter((battle) => {
    if (activeTab === "all") return true
    return battle.status === activeTab
  })

  return (
    <div className="relative">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -right-1/4 top-0 h-[500px] w-[500px] rounded-full bg-accent-pink/[0.03] blur-[150px]" />
        <div className="absolute -left-1/4 bottom-0 h-[400px] w-[400px] rounded-full bg-primary/[0.03] blur-[120px]" />
      </div>

      {/* ヘッダー */}
      <div className="relative mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">バトル一覧</h1>
          <p className="mt-1 text-sm text-text-muted">リアルタイムの対決を観戦・参加しよう</p>
        </div>
        <button
          className="group relative overflow-hidden rounded-xl px-5 py-2.5 text-sm font-semibold text-dark-base transition-all"
          type="button"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-accent-pink via-primary to-cyan" />
          <span className="relative">+ バトル作成</span>
        </button>
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

      {/* バトル一覧 */}
      <div className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filteredBattles.map((battle) => (
          <BattleCard key={battle.id} battle={battle} />
        ))}
      </div>

      {filteredBattles.length === 0 && (
        <div className="py-20 text-center text-text-disabled">
          該当するバトルはありません
        </div>
      )}
    </div>
  )
}
