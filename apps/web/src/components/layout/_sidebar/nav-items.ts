export type SidebarNavItem = {
  emoji: string
  href: string
  label: string
}

export const SIDEBAR_NAV_ITEMS: ReadonlyArray<SidebarNavItem> = [
  { emoji: "🏠", href: "/", label: "ホーム" },
  { emoji: "📺", href: "/stream/me", label: "配信" },
  { emoji: "🤝", href: "/matching", label: "マッチング" },
  { emoji: "⚔️", href: "/battles", label: "バトル" },
  { emoji: "🔍", href: "/search", label: "検索" },
  { emoji: "👤", href: "/profile/me", label: "プロフィール" },
]
