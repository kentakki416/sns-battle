"use client"

import { motion } from "framer-motion"
import { useState } from "react"

import type { MatchingThemeEvent } from "../hooks/useMatchingDataChannel"

type Props = {
  disabled: boolean
  onSelectChoice: (choiceId: number | null) => void
  theme: MatchingThemeEvent
}

/**
 * 現在のテーマを表示する中央カード。
 *
 * - CHOICE タイプ: 選択肢ボタンをグリッド表示。クリックで `onSelectChoice(choiceId)`
 * - FREE_TALK タイプ: 選択肢なし、「フリートークOK」CTA を表示し、クリックで `onSelectChoice(null)`
 * - 自分が選択済なら disabled に倒し、選んだ choice を強調表示
 * - round_number と speaker サイドの表示
 */
export function ThemeCard({ disabled, onSelectChoice, theme }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const handlePick = (choiceId: number | null) => {
    if (disabled) return
    setSelectedId(choiceId)
    onSelectChoice(choiceId)
  }

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="pointer-events-auto mx-auto max-w-md rounded-3xl border border-primary/30 bg-dark-elevated/85 p-6 text-center shadow-[0_0_36px_rgba(203,172,249,0.18)] backdrop-blur"
      initial={{ opacity: 0, y: 12 }}
      key={`${theme.round_number}-${theme.theme_id}`}
      transition={{ duration: 0.35 }}
    >
      <p className="mb-2 text-xs tracking-[0.3em] text-primary">
        ROUND {theme.round_number} / 10
      </p>
      <h3 className="text-xl font-bold text-white sm:text-2xl">{theme.title}</h3>
      <p className="mt-1 text-xs text-text-muted">
        {theme.speaker === "user1" ? "左の人が話す" : "右の人が話す"}
      </p>

      {theme.type === "CHOICE" ? (
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {theme.choices.map((c) => {
            const picked = selectedId === c.id
            return (
              <button
                className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-sm transition ${
                  picked
                    ? "border-primary bg-primary/15 text-white"
                    : "border-dark-border bg-dark-surface text-text-secondary hover:border-primary/50"
                } ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
                disabled={disabled}
                key={c.id}
                onClick={() => handlePick(c.id)}
                type="button"
              >
                <span className="text-2xl">{c.emoji}</span>
                <span>{c.label}</span>
              </button>
            )
          })}
        </div>
      ) : (
        <button
          className={`mt-5 rounded-full bg-primary px-6 py-2 text-sm font-medium text-white transition hover:bg-primary-hover ${
            disabled ? "cursor-not-allowed opacity-60" : ""
          }`}
          disabled={disabled}
          onClick={() => handlePick(null)}
          type="button"
        >
          フリートークでOK
        </button>
      )}
    </motion.div>
  )
}
