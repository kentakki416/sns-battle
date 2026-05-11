"use client"

import type { MatchingStamp } from "@repo/api-schema"

type Props = {
    onSelect: (itemId: number) => void
    stamps: MatchingStamp[]
}

/**
 * セッション中に表示するスタンプパレット。
 *
 * 既存の汎用 `<StampPalette emojis onSelect>` は emoji ベースだが、マッチングのスタンプ送信 API
 * は `item_id` を要求する。ここでは MATCHING スコープのスタンプ一覧を受け取り、emoji を
 * 表示しつつクリックで item_id を送るマッチング専用パレットを薄く実装する。
 *
 * - グリッド: 6 列、emoji + 名前の縦配置
 * - 0 件の場合は何も表示しない（呼び出し側で表示制御）
 */
export function MatchingStampPalette({ onSelect, stamps }: Props) {
  if (stamps.length === 0) return null
  return (
    <div
      className="pointer-events-auto absolute inset-x-0 bottom-20 z-10 mx-auto max-w-md rounded-2xl px-4 py-3"
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,3,25,0.7)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      <div className="grid grid-cols-6 gap-2">
        {stamps.map((s) => (
          <button
            aria-label={`スタンプ ${s.name}`}
            className="flex h-12 flex-col items-center justify-center rounded-lg text-xl transition hover:scale-110 hover:bg-white/[0.08]"
            key={s.id}
            onClick={() => onSelect(s.id)}
            type="button"
          >
            <span>{s.emoji}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
