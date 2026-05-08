"use client"

import { useState } from "react"

const OPTIONS = [
  { label: "男性", value: "MALE" },
  { label: "女性", value: "FEMALE" },
  { label: "その他", value: "OTHER" },
] as const

type Props = {
  defaultValues?: string[]
}

/**
 * 希望する相手の性別を複数選択する chip 群。
 * 未選択 = 制限なし、空配列で送信される。
 */
export function GenderMultiSelect({ defaultValues = [] }: Props) {
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
    <div className="flex gap-2">
      {OPTIONS.map((opt) => {
        const isSelected = selected.has(opt.value)
        return (
          <label
            className={[
              "cursor-pointer rounded-lg border px-4 py-2 text-sm transition",
              isSelected
                ? "border-primary-border bg-primary-glow text-primary"
                : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
            ].join(" ")}
            key={opt.value}
          >
            <input
              checked={isSelected}
              className="sr-only"
              name="preferred_genders"
              onChange={() => toggle(opt.value)}
              type="checkbox"
              value={opt.value}
            />
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}
