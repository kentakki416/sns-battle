"use client"

import { useCallback, useEffect, useState } from "react"

import type { SearchUserSummary, SearchUsersResponse } from "@repo/api-schema"

import { UserCard } from "@/components/features/user-card"

type Props = {
  query: string
}

type FetchState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; nextCursor: number | null; users: SearchUserSummary[] }

const PAGE_SIZE = 20

/**
 * `/search` 配下のユーザータブ結果（クライアント側で fetch + 「もっと見る」ページネーション）。
 * 初回 mount または `query` 変化時に最新ページを取り直す。
 *
 * 空 query 時は親 (`SearchClient`) で本コンポーネントを mount しないように出し分けたい所だが、
 * URL 直入力で `?q=` 無しのまま着地するケースを許容するため、ここでも空ガードを残してプレースホルダ表示する。
 */
export function SearchResults({ query }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" })
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchPage = useCallback(
    async (cursor: number | null): Promise<SearchUsersResponse | null> => {
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), q: query })
      if (cursor !== null) params.set("cursor", String(cursor))
      const res = await fetch(`/api/users/search?${params.toString()}`)
      if (!res.ok) return null
      return (await res.json()) as SearchUsersResponse
    },
    [query],
  )

  useEffect(() => {
    if (query.length === 0) return
    let cancelled = false
    /**
     * 親 (`SearchClient`) で `<SearchResults key={query} ...>` で remount しているため、
     * `query` 変更時はこのコンポーネントごと作り直され、初期 state ("loading") から始まる。
     * そのため effect 本体で同期的に loading にリセットする必要は無い。
     */
    fetchPage(null).then((data) => {
      if (cancelled) return
      if (!data) {
        setState({ kind: "error" })
        return
      }
      setState({ kind: "loaded", nextCursor: data.next_cursor, users: data.users })
    })
    return () => {
      cancelled = true
    }
  }, [query, fetchPage])

  const handleLoadMore = async () => {
    if (state.kind !== "loaded" || state.nextCursor === null || loadingMore) return
    setLoadingMore(true)
    const data = await fetchPage(state.nextCursor)
    setLoadingMore(false)
    if (!data) return
    setState({
      kind: "loaded",
      nextCursor: data.next_cursor,
      users: [...state.users, ...data.users],
    })
  }

  if (query.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <span className="text-5xl">🔍</span>
        <p className="text-sm text-text-muted">キーワードを入力して検索してください</p>
      </div>
    )
  }

  if (state.kind === "loading") {
    return <p className="py-12 text-center text-sm text-text-muted">検索中...</p>
  }

  if (state.kind === "error") {
    return (
      <p className="py-12 text-center text-sm text-error">
        検索に失敗しました。時間をおいて再度お試しください。
      </p>
    )
  }

  if (state.users.length === 0) {
    return (
      <p className="py-12 text-center text-sm text-text-muted">
        「{query}」に一致するユーザーは見つかりませんでした
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {state.users.map((user) => (
          <UserCard key={user.id} user={user} />
        ))}
      </div>
      {state.nextCursor !== null ? (
        <button
          className="mt-2 rounded-lg border border-dark-border bg-dark-surface/60 px-4 py-2 text-sm text-white transition hover:border-primary-border disabled:opacity-50"
          disabled={loadingMore}
          onClick={handleLoadMore}
          type="button"
        >
          {loadingMore ? "読み込み中..." : "もっと見る"}
        </button>
      ) : null}
    </div>
  )
}
