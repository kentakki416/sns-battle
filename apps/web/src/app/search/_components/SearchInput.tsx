"use client"

import { useRouter } from "next/navigation"
import { useState, type KeyboardEvent } from "react"

type Props = {
  initialQuery: string
}

/**
 * `/search` ページ内の大きな検索バー。Enter で URL の `?q=` を更新し、SearchResults が
 * `useSearchParams` 経由で再 fetch する設計。
 */
export function SearchInput({ initialQuery }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(initialQuery)

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      const trimmed = value.trim()
      if (trimmed.length === 0) {
        router.push("/search")
      } else {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`)
      }
    }
  }

  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-lg text-text-muted">
        🔍
      </span>
      <input
        autoFocus
        className="h-14 w-full rounded-2xl border border-dark-border bg-dark-surface/50 pl-12 pr-4 text-base text-white backdrop-blur-sm placeholder:text-text-muted focus:border-primary-border focus:shadow-[0_0_20px_rgba(203,172,249,0.08)] focus:outline-none"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="配信・ユーザー・バトルを検索..."
        type="search"
        value={value}
      />
    </div>
  )
}
