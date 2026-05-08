"use client"

import { useState } from "react"

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const

type Props = {
  defaultValues?: string[]
}

/**
 * 希望する相手の MBTI を複数選択する 4x4 グリッド。
 * 未選択 = 制限なし、空配列で送信される。
 */
export function MbtiMultiSelect({ defaultValues = [] }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues))

  const toggle = (v: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {MBTI_TYPES.map((t) => {
        const isSelected = selected.has(t)
        return (
          <label
            className={[
              "cursor-pointer rounded-lg border py-2 text-center text-xs transition",
              isSelected
                ? "border-primary-border bg-primary-glow text-primary"
                : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
            ].join(" ")}
            key={t}
          >
            <input
              checked={isSelected}
              className="sr-only"
              name="preferred_mbti"
              onChange={() => toggle(t)}
              type="checkbox"
              value={t}
            />
            {t}
          </label>
        )
      })}
    </div>
  )
}
