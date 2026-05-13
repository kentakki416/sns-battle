"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { AuthMeResponse, FollowUserSummary, ListFollowingResponse } from "@repo/api-schema"

type Props = {
  collapsed: boolean
  me: AuthMeResponse | null
}

type FetchState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "loaded"; users: FollowUserSummary[] }

/**
 * Sidebar に表示する current user のフォロー中ユーザー一覧。
 *
 * - me が null（未ログイン or `/api/auth/me` 失敗）の場合は何も描画しない
 * - Phase 8 の `streams` テーブル新設後にライブ状態のリアルタイム表示を載せる予定。
 *   現状の API（`GET /api/users/:id/following`）はライブ情報を返さないため、live バッジは未表示。
 */
export function SidebarFollowing({ collapsed, me }: Props) {
  const [state, setState] = useState<FetchState>({ kind: "loading" })

  useEffect(() => {
    if (!me) return
    let cancelled = false
    const params = new URLSearchParams({ limit: "50" })
    fetch(`/api/users/${me.id}/following?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`status ${res.status}`)
        return (await res.json()) as ListFollowingResponse
      })
      .then((data) => {
        if (cancelled) return
        setState({ kind: "loaded", users: data.users })
      })
      .catch(() => {
        if (cancelled) return
        setState({ kind: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [me])

  if (!me) return null

  return (
    <div className="mt-6 flex-1 overflow-y-auto px-3">
      {!collapsed && (
        <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-disabled">
          フォロー中
        </h3>
      )}
      {state.kind === "loading" && !collapsed ? (
        <p className="px-2 py-1 text-xs text-text-disabled">読み込み中...</p>
      ) : null}
      {state.kind === "error" && !collapsed ? (
        <p className="px-2 py-1 text-xs text-error">読み込みに失敗しました</p>
      ) : null}
      {state.kind === "loaded" ? (
        state.users.length === 0 ? (
          !collapsed ? (
            <p className="px-2 py-1 text-xs text-text-disabled">
              まだ誰もフォローしていません
            </p>
          ) : null
        ) : (
          <ul className="flex flex-col gap-1">
            {state.users.map((user) => (
              <li key={user.id}>
                <Link
                  className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]"
                  href={`/profile/${user.id}`}
                  title={collapsed ? user.name ?? "" : undefined}
                >
                  <span className="relative flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/40 to-cyan/40 text-sm font-bold text-white">
                    {user.avatar_url ? (
                      /**
                       * next/image は外部ホスト許可リスト設定が必要なので一旦 <img> でフォールバック。
                       */
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt="" className="h-full w-full object-cover" src={user.avatar_url} />
                    ) : (
                      <span>{(user.name?.[0] ?? "?").toUpperCase()}</span>
                    )}
                  </span>
                  {!collapsed && (
                    <span className="truncate text-sm text-white">
                      {user.name ?? "(名前未設定)"}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  )
}
