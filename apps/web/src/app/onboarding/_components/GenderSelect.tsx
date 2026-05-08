"use client"

import { useState } from "react"

const OPTIONS = [
  { label: "男性", value: "MALE" },
  { label: "女性", value: "FEMALE" },
  { label: "その他", value: "OTHER" },
] as const

type Props = {
  defaultValue?: "MALE" | "FEMALE" | "OTHER"
}

/**
 * 性別の単一選択（ラジオ風 chip）
 * step9 で apps/web/src/components/forms に共通化予定。
 */
export function GenderSelect({ defaultValue }: Props) {
  const [selected, setSelected] = useState<string>(defaultValue ?? "")

  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => {
        const isSelected = selected === opt.value
        return (
          <label
            className={[
              "flex-1 cursor-pointer rounded-lg border px-3 py-2 text-center text-sm transition",
              isSelected
                ? "border-primary-border bg-primary-glow text-primary"
                : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
            ].join(" ")}
            key={opt.value}
          >
            <input
              checked={isSelected}
              className="sr-only"
              name="gender"
              onChange={() => setSelected(opt.value)}
              required
              type="radio"
              value={opt.value}
            />
            {opt.label}
          </label>
        )
      })}
    </div>
  )
}
