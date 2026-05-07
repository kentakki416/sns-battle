"use client"

import type { FollowingUser } from "../sidebar"

type Props = {
  collapsed: boolean
  users: ReadonlyArray<FollowingUser>
}

export function SidebarFollowing({ collapsed, users }: Props) {
  const visibleUsers = collapsed ? users.filter((u) => u.isLive) : users

  return (
    <div className="mt-6 flex-1 overflow-y-auto px-3">
      {!collapsed && (
        <h3 className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-text-disabled">
          フォロー中
        </h3>
      )}
      <ul className="flex flex-col gap-1">
        {visibleUsers.map((user) => (
          <li key={user.id}>
            <a
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.03]"
              href={`/profile/${user.id}`}
              title={collapsed ? user.name : undefined}
            >
              <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-dark-elevated text-base">
                {user.avatarEmoji}
                {user.isLive && (
                  <span
                    aria-label="ライブ中"
                    className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: "#22C55E",
                      border: "2px solid rgba(4,7,29,1)",
                    }}
                  />
                )}
              </span>
              {!collapsed && (
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm text-white">{user.name}</span>
                  {user.isLive && user.viewerCount !== undefined && (
                    <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
                      <span className="font-bold text-error">LIVE</span>
                      <span>{user.viewerCount.toLocaleString()}視聴</span>
                    </span>
                  )}
                </div>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
