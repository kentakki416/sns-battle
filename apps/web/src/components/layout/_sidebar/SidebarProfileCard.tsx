"use client"

import Link from "next/link"

type Props = {
  collapsed: boolean
}

export function SidebarProfileCard({ collapsed }: Props) {
  return (
    <Link
      className="mt-auto flex items-center gap-3 border-t border-white/[0.05] px-3 py-3 transition hover:bg-white/[0.03]"
      href="/profile/me"
    >
      <span
        className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)" }}
      >
        K
      </span>
      {!collapsed && (
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium text-white">ケンタ</span>
          <span className="truncate text-xs text-text-muted">@kenta</span>
        </div>
      )}
    </Link>
  )
}
