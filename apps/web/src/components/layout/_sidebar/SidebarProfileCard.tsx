"use client"

import Link from "next/link"

import type { AuthMeResponse } from "@repo/api-schema"

type Props = {
  collapsed: boolean
  me: AuthMeResponse | null
}

export function SidebarProfileCard({ collapsed, me }: Props) {
  if (!me) return null
  const displayName = me.name ?? "(名前未設定)"
  const initial = (me.name?.[0] ?? me.email?.[0] ?? "?").toUpperCase()

  return (
    <Link
      className="mt-auto flex items-center gap-3 border-t border-white/[0.05] px-3 py-3 transition hover:bg-white/[0.03]"
      href={`/profile/${me.id}`}
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)" }}
      >
        {me.avatar_url ? (
          /**
           * next/image は外部ホスト許可リスト設定が必要なので一旦 <img> でフォールバック。
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="h-full w-full object-cover" src={me.avatar_url} />
        ) : (
          initial
        )}
      </span>
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-white">{displayName}</span>
          {me.email ? (
            <span className="truncate text-xs text-text-muted">{me.email}</span>
          ) : null}
        </div>
      )}
    </Link>
  )
}
