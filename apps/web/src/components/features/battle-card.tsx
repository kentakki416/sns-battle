import Link from "next/link"

import LiveBadge from "@/components/ui/live-badge"
import type { MockBattle } from "@/libs/mock-data"

type BattleCardProps = {
  battle: MockBattle
}

export default function BattleCard({ battle }: BattleCardProps) {
  const totalStamps = battle.hostStamps + battle.opponentStamps
  const hostPercent = totalStamps > 0 ? Math.round((battle.hostStamps / totalStamps) * 100) : 50

  return (
    <Link
      className="glass-card group flex flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(203,172,249,0.08)]"
      href={`/battles/${battle.id}`}
    >
      <div className="p-5">
        {/* ステータス + タイトル */}
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text-primary transition-colors group-hover:text-primary">
            {battle.title}
          </h3>
          {battle.status === "live" && <LiveBadge />}
          {battle.status === "waiting" && (
            <span className="rounded-md px-2 py-0.5 text-[10px] font-bold"
              style={{
                background: "rgba(14,165,233,0.15)",
                border: "1px solid rgba(14,165,233,0.3)",
                color: "#0EA5E9",
              }}
            >
              募集中
            </span>
          )}
          {battle.status === "finished" && (
            <span className="rounded-md border border-white/[0.05] bg-white/[0.03] px-2 py-0.5 text-[10px] font-bold text-text-disabled">
              終了
            </span>
          )}
        </div>

        {/* VS 表示 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 text-xl">
              {battle.hostAvatar}
            </span>
            <span className="text-sm font-medium text-text-primary">{battle.hostName}</span>
          </div>

          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.03]">
            <span className="text-sm text-text-disabled">VS</span>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-sm font-medium text-text-primary">
              {battle.opponentName || "???"}
            </span>
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-accent-pink/20 to-accent-pink/5 text-xl">
              {battle.opponentAvatar || "❓"}
            </span>
          </div>
        </div>

        {/* スタンプカウント（ライブ時） */}
        {battle.status === "live" && totalStamps > 0 && (
          <div className="mt-4">
            <div className="flex h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <div
                className="rounded-l-full bg-gradient-to-r from-primary to-primary-light transition-all"
                style={{ width: `${hostPercent}%` }}
              />
              <div
                className="rounded-r-full bg-gradient-to-r from-pink-light to-accent-pink transition-all"
                style={{ width: `${100 - hostPercent}%` }}
              />
            </div>
            <div className="mt-1.5 flex justify-between text-[11px] text-text-muted">
              <span className="text-primary">{battle.hostStamps} votes</span>
              <span className="text-accent-pink">{battle.opponentStamps} votes</span>
            </div>
          </div>
        )}

        {/* 観戦者数 */}
        {battle.status === "live" && (
          <div className="mt-3 text-[11px] text-text-disabled">
            👁 {battle.spectators}人が観戦中
          </div>
        )}

        {/* 参加ボタン（募集中） */}
        {battle.status === "waiting" && (
          <button
            className="mt-4 w-full rounded-lg bg-gradient-to-r from-cyan to-primary py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            type="button"
          >
            参加する
          </button>
        )}
      </div>
    </Link>
  )
}
