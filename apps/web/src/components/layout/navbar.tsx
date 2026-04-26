"use client"

import Link from "next/link"
import { useState } from "react"

export default function Navbar() {
  const [searchQuery, setSearchQuery] = useState("")

  return (
    <header className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between border-b border-white/[0.08] px-5"
      style={{
        background: "rgba(17, 25, 40, 0.75)",
        backdropFilter: "blur(16px) saturate(180%)",
      }}
    >
      {/* 左: ロゴ */}
      <Link className="flex items-center gap-2.5" href="/">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary to-cyan">
          <span className="text-sm font-bold text-dark-base">⚡</span>
        </div>
        <span className="text-base font-bold text-text-primary">
          SNS Battle
        </span>
      </Link>

      {/* 中央: 検索バー */}
      <div className="mx-6 hidden max-w-md flex-1 md:block">
        <div className="relative">
          <input
            className="w-full rounded-lg border border-white/[0.08] bg-dark-base/50 px-4 py-2 pl-10 text-sm text-text-primary placeholder-text-muted transition-all focus:border-primary/50 focus:shadow-[0_0_12px_rgba(203,172,249,0.1)] focus:outline-none"
            placeholder="配信・ユーザー・バトルを検索..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                window.location.href = `/search?q=${encodeURIComponent(searchQuery)}`
              }
            }}
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted">
            🔍
          </span>
        </div>
      </div>

      {/* 右: アクション */}
      <div className="flex items-center gap-3">
        <Link
          className="group relative overflow-hidden rounded-lg px-5 py-2 text-sm font-semibold text-white transition-all"
          href="/matching"
        >
          <span className="absolute inset-0 bg-gradient-to-r from-primary via-cyan to-primary bg-[length:200%_100%] transition-all group-hover:animate-shimmer" />
          <span className="relative">マッチング開始</span>
        </Link>

        {/* 通知 */}
        <button
          className="relative rounded-lg p-2 text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text-primary"
          type="button"
        >
          🔔
          <span className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-accent-pink text-[9px] font-bold text-white">
            3
          </span>
        </button>

        {/* アバター */}
        <Link
          className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-primary to-accent-pink text-xs font-bold text-white transition-shadow hover:shadow-[0_0_12px_rgba(203,172,249,0.3)]"
          href="/profile/me"
        >
          K
        </Link>
      </div>
    </header>
  )
}
