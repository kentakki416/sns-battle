"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

const navItems = [
  { href: "/", icon: "🏠", label: "ホーム" },
  { href: "/stream/demo-user", icon: "📺", label: "配信" },
  { href: "/matching", icon: "🤝", label: "マッチング" },
  { href: "/battles", icon: "⚔️", label: "バトル" },
  { href: "/search", icon: "🔍", label: "検索" },
]

const followingUsers = [
  { avatar: "🎸", isLive: true, name: "ギターマスター", viewers: 1234 },
  { avatar: "🎮", isLive: true, name: "ゲーマーX", viewers: 567 },
  { avatar: "🎨", isLive: false, name: "アート太郎", viewers: 0 },
  { avatar: "🎤", isLive: false, name: "シンガーY", viewers: 0 },
  { avatar: "📚", isLive: false, name: "読書家Z", viewers: 0 },
]

export default function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={`fixed left-0 top-14 z-40 flex h-[calc(100vh-56px)] flex-col border-r border-white/[0.05] transition-all duration-300 ${
        collapsed ? "w-[68px]" : "w-60"
      }`}
      style={{
        background: "linear-gradient(180deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.9) 100%)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* 折りたたみボタン */}
      <button
        className="mx-auto my-3 flex h-7 w-7 items-center justify-center rounded-md text-xs text-text-muted transition-colors hover:bg-white/[0.05] hover:text-text-primary"
        type="button"
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? "▸" : "◂"}
      </button>

      {/* ナビゲーション */}
      <nav className="flex flex-col gap-1 px-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))
          return (
            <Link
              key={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-all ${
                isActive
                  ? "bg-primary-glow border border-primary-border text-primary"
                  : "border border-transparent text-text-muted hover:bg-white/[0.03] hover:text-text-primary"
              } ${collapsed ? "justify-center px-2" : ""}`}
              href={item.href}
            >
              <span className="text-base">{item.icon}</span>
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* フォロー中 */}
      {!collapsed && (
        <div className="mt-6 flex-1 overflow-y-auto px-3">
          <h3 className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-text-disabled">
            フォロー中
          </h3>
          <div className="flex flex-col gap-0.5">
            {followingUsers.map((user) => (
              <Link
                key={user.name}
                className="group flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-text-muted transition-colors hover:bg-white/[0.03] hover:text-text-primary"
                href={`/profile/${user.name}`}
              >
                <span className="relative text-base">
                  {user.avatar}
                  {user.isLive && (
                    <span className="absolute -bottom-0.5 -right-1 h-2 w-2 rounded-full border border-dark-base bg-success" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{user.name}</span>
                    {user.isLive && (
                      <span className="shrink-0 rounded bg-error/20 px-1 py-px text-[9px] font-bold text-error">
                        LIVE
                      </span>
                    )}
                  </div>
                  {user.isLive && (
                    <span className="text-[10px] text-text-disabled">
                      {user.viewers.toLocaleString()} 視聴中
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {collapsed && (
        <div className="mt-6 flex flex-col items-center gap-2">
          {followingUsers
            .filter((u) => u.isLive)
            .map((user) => (
              <Link
                key={user.name}
                className="relative flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.03] text-sm transition-colors hover:bg-white/[0.08]"
                href={`/profile/${user.name}`}
                title={user.name}
              >
                {user.avatar}
                <span className="absolute -right-px -top-px h-2.5 w-2.5 rounded-full border-2 border-dark-base bg-success" />
              </Link>
            ))}
        </div>
      )}
    </aside>
  )
}
