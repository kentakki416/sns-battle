"use client"

import { useState } from "react"

import type { HobbyMaster } from "@repo/api-schema"

type Props = {
  defaultSelectedIds?: number[]
  hobbies: HobbyMaster[]
}

/**
 * 趣味マスターを chip として複数選択する。
 * 選択された hobby は name="hobby_ids" の hidden checkbox として送信される。
 */
export function HobbyChips({ defaultSelectedIds = [], hobbies }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultSelectedIds))

  if (hobbies.length === 0) {
    return (
      <p className="text-xs text-text-disabled">趣味の選択肢が登録されていません。</p>
    )
  }

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hobbies.map((hobby) => {
        const isSelected = selected.has(hobby.id)
        return (
          <label
            className={[
              "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition",
              isSelected
                ? "border-primary-border bg-primary-glow text-primary"
                : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
            ].join(" ")}
            key={hobby.id}
          >
            <input
              checked={isSelected}
              className="sr-only"
              name="hobby_ids"
              onChange={() => toggle(hobby.id)}
              type="checkbox"
              value={hobby.id}
            />
            {hobby.name}
          </label>
        )
      })}
    </div>
  )
}
