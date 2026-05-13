"use client"

import { useSearchParams } from "next/navigation"
import { useState } from "react"

import { SearchInput } from "./SearchInput"
import { SearchResults } from "./SearchResults"
import { SearchTabs } from "./SearchTabs"
import type { SearchTab } from "./tabs"

/**
 * `/search` ページのクライアント本体。`?q=` をソースオブトゥルースとし、SearchInput が URL を
 * 書き換え→`useSearchParams` で読み戻し→SearchResults が再 fetch する単方向データフロー。
 */
export function SearchClient() {
  const params = useSearchParams()
  const query = params.get("q")?.trim() ?? ""
  /** タブは page state のみ（URL には載せない）。現状有効なのは "user" のみ */
  const [activeTab, setActiveTab] = useState<SearchTab>("user")

  return (
    <div className="flex flex-col gap-6">
      <SearchInput initialQuery={query} />
      <SearchTabs activeTab={activeTab} onChange={setActiveTab} />
      {/**
       * `key={query}` で query 変化時に SearchResults を remount する。
       * effect 内 setState を避けて初期 state ("loading") からやり直す。
       */}
      {activeTab === "user" ? <SearchResults key={query} query={query} /> : null}
    </div>
  )
}
