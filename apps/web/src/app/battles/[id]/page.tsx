"use client"

import { useState } from "react"

import LiveBadge from "@/components/ui/live-badge"
import VideoChatOverlay from "@/components/ui/video-chat-overlay"
import { mockBattles, mockChatMessages, mockThemes } from "@/libs/mock-data"

export default function BattleRoomPage() {
  const battle = mockBattles[0]
  const theme = mockThemes[0]
  const [stampTarget, setStampTarget] = useState<"host" | "opponent">("host")

  const totalStamps = battle.hostStamps + battle.opponentStamps
  const hostPercent = totalStamps > 0 ? Math.round((battle.hostStamps / totalStamps) * 100) : 50

  return (
    <div className="relative flex h-screen flex-col">
      {/* 上部: タイトル + スタンプカウント */}
      <div className="absolute left-0 right-0 top-0 z-10 p-4"
        style={{ background: "linear-gradient(to bottom, rgba(0,3,25,0.8) 0%, transparent 100%)" }}
      >
        <div className="flex items-center gap-3">
          <h1 className="text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
            {battle.title}
          </h1>
          <LiveBadge />
          <span className="ml-auto text-xs text-white/70">
            👁 {battle.spectators}人が観戦中
          </span>
        </div>

        {/* スタンプカウント */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-primary drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              {battle.hostName} {battle.hostStamps}
            </span>
            <span className="text-white/50">{hostPercent}% — {100 - hostPercent}%</span>
            <span className="font-semibold text-accent-pink drop-shadow-[0_1px_2px_rgba(0,0,0,0.6)]">
              {battle.opponentStamps} {battle.opponentName}
            </span>
          </div>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-white/[0.1]">
            <div
              className="rounded-l-full bg-gradient-to-r from-primary-light to-primary transition-all duration-700"
              style={{ width: `${hostPercent}%` }}
            />
            <div
              className="rounded-r-full bg-gradient-to-r from-accent-pink to-pink-light transition-all duration-700"
              style={{ width: `${100 - hostPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* VS ビデオ（フルスクリーン） */}
      <div className="flex flex-1">
        {/* ホスト側 */}
        <div className="relative flex-1 bg-gradient-to-br from-purple-900/50 to-indigo-900/40"
          style={{ borderRight: "1px solid rgba(255,255,255,0.05)" }}
        >
          <div className="absolute inset-0 flex items-center justify-center text-[100px] opacity-10">
            {battle.hostAvatar}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-dark-base/40 to-transparent" />
          <div className="absolute bottom-20 left-4 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
              style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
            >
              {battle.hostAvatar}
            </span>
            <span className="rounded-lg px-2.5 py-1 text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
              style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
            >
              {battle.hostName}
            </span>
            <span className="rounded-md px-1.5 py-0.5 text-[10px] font-bold"
              style={{
                background: "rgba(34,197,94,0.2)",
                border: "1px solid rgba(34,197,94,0.4)",
                color: "#22C55E",
              }}
            >
              🎤 話し中
            </span>
          </div>
        </div>

        {/* VS バッジ */}
        <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2">
          <div className="flex h-14 w-14 items-center justify-center rounded-full shadow-[0_0_20px_rgba(0,0,0,0.5)]"
            style={{ background: "rgba(0,3,25,0.7)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            <span className="text-base font-bold text-white/80">VS</span>
          </div>
        </div>

        {/* 対戦者側 */}
        <div className="relative flex-1 bg-gradient-to-br from-pink-900/40 to-rose-900/30">
          <div className="absolute inset-0 flex items-center justify-center text-[100px] opacity-8">
            {battle.opponentAvatar}
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-dark-base/40 to-transparent" />
          <div className="absolute bottom-20 right-4 flex items-center gap-2">
            <span className="rounded-md border border-white/[0.1] bg-white/[0.05] px-1.5 py-0.5 text-[10px] font-bold text-white/50">
              🔇 待機中
            </span>
            <span className="rounded-lg px-2.5 py-1 text-sm font-semibold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]"
              style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
            >
              {battle.opponentName}
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg"
              style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
            >
              {battle.opponentAvatar}
            </span>
          </div>
        </div>
      </div>

      {/* テーマ表示（下部オーバーレイ） */}
      <div className="absolute bottom-[140px] left-1/2 z-10 -translate-x-1/2">
        <div className="rounded-xl px-6 py-3 text-center"
          style={{
            background: "rgba(0,3,25,0.7)",
            backdropFilter: "blur(12px)",
            border: "1px solid rgba(203,172,249,0.2)",
          }}
        >
          <p className="text-[11px] text-white/50">🔄 {battle.hostName} のターン（残り 0:42）</p>
          <p className="mt-0.5 text-sm font-bold text-white">{theme.title}</p>
        </div>
      </div>

      {/* スタンプ送信先タブ（コメント上） */}
      <div className="absolute bottom-[96px] left-4 z-10 flex gap-2">
        <button
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
            stampTarget === "host"
              ? "text-primary"
              : "text-white/50 hover:text-white/80"
          }`}
          style={{
            background: stampTarget === "host" ? "rgba(203,172,249,0.15)" : "rgba(0,3,25,0.5)",
            backdropFilter: "blur(8px)",
            border: stampTarget === "host" ? "1px solid rgba(203,172,249,0.3)" : "1px solid transparent",
          }}
          type="button"
          onClick={() => setStampTarget("host")}
        >
          {battle.hostName}に送る
        </button>
        <button
          className={`rounded-lg px-3 py-1.5 text-[11px] font-semibold transition-all ${
            stampTarget === "opponent"
              ? "text-accent-pink"
              : "text-white/50 hover:text-white/80"
          }`}
          style={{
            background: stampTarget === "opponent" ? "rgba(236,72,153,0.15)" : "rgba(0,3,25,0.5)",
            backdropFilter: "blur(8px)",
            border: stampTarget === "opponent" ? "1px solid rgba(236,72,153,0.3)" : "1px solid transparent",
          }}
          type="button"
          onClick={() => setStampTarget("opponent")}
        >
          {battle.opponentName}に送る
        </button>
      </div>

      {/* コメントオーバーレイ（画面下部に被せる） */}
      <div className="pointer-events-none absolute inset-0">
        <div className="pointer-events-auto absolute bottom-0 left-0 w-[50%]">
          <VideoChatOverlay messages={mockChatMessages} />
        </div>
      </div>
    </div>
  )
}
