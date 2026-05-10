"use client"

import type { GetReactionsResponse } from "@repo/api-schema"

type Props = {
  rounds: GetReactionsResponse["rounds"]
}

/**
 * 10 ラウンド分の一致 / 不一致カードを縦に並べる。
 * - 一致: パープル枠 + 🎉
 * - 不一致: 通常枠 + ✕
 * - FREE_TALK や相手未回答は label が null になるので "-" 表示にフォールバック
 */
export function RoundList({ rounds }: Props) {
  return (
    <div className="mt-6 space-y-2 rounded-2xl border border-dark-border bg-dark-surface/60 p-4 backdrop-blur">
      {rounds.map((r) => (
        <div
          className={[
            "flex items-center gap-3 rounded-xl border px-3 py-2.5",
            r.is_match
              ? "border-primary/30 bg-primary/[0.05]"
              : "border-dark-border bg-white/[0.02]",
          ].join(" ")}
          key={r.round_number}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs font-bold text-white">
            {r.round_number}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-white">{r.theme.title}</p>
            <p className="truncate text-xs text-text-muted">
              あなた: {r.my_choice?.label ?? "-"}　相手: {r.peer_choice?.label ?? "-"}
            </p>
          </div>
          <span aria-hidden className="text-lg">
            {r.is_match ? "🎉" : "✕"}
          </span>
        </div>
      ))}
    </div>
  )
}
