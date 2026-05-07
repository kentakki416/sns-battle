"use client"

import { useRouter } from "next/navigation"
import { useState, type KeyboardEvent } from "react"

export function NavbarSearch() {
  const router = useRouter()
  const [query, setQuery] = useState("")

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && query.trim().length > 0) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`)
    }
  }

  return (
    <div className="hidden flex-1 px-8 md:block">
      <div className="relative mx-auto max-w-md">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
          🔍
        </span>
        <input
          className="h-9 w-full rounded-lg border border-dark-border bg-dark-base/50 pl-9 pr-3 text-sm text-white placeholder:text-text-muted focus:border-primary-border focus:outline-none"
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="配信・ユーザー・バトルを検索"
          type="search"
          value={query}
        />
      </div>
    </div>
  )
}
