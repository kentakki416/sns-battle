# step3-web-sidebar.md

`<Sidebar>` を実装し、step1 の `<AppShell>` プレースホルダーと差し替える。左固定（展開 240px / 折りたたみ 68px）でナビゲーション・フォロー中ユーザー・自分のプロフィールカードを縦に並べる。

UI 仕様は `docs/spec/common/README.md` の [Sidebar](./README.md#sidebar左固定-240px--折りたたみ-68px--appswebsrccomponentslayoutsidebartsx) を参照。

折りたたみ状態は `localStorage` に永続化する。フォロー中ユーザーは将来 `GET /api/users/me/following` から取得するが、今 step ではモック配列を渡せる prop 設計にしておく。

## 対応内容

### ファイル構成

```
apps/web/src/components/layout/
├── sidebar.tsx                 ← Client Component（折りたたみ状態管理 + 全体レイアウト）
└── _sidebar/
    ├── SidebarNav.tsx          ← Client（ナビゲーション項目）
    ├── SidebarNavItem.tsx      ← Client（ナビ項目 1 件）
    ├── SidebarFollowing.tsx    ← Client（フォロー中ユーザー一覧）
    ├── SidebarProfileCard.tsx  ← Client（最下部のプロフィールカード）
    ├── SidebarToggle.tsx       ← Client（折りたたみトグルボタン）
    └── nav-items.ts            ← ナビ項目定義（純粋データ）
```

### `_sidebar/nav-items.ts`

```typescript
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
```

### `sidebar.tsx`

折りたたみ状態を `localStorage` に保存。SSR 時はデフォルト展開で出して、マウント後に復元する（hydration mismatch を避けるため初期値固定）。

```typescript
"use client"

import { useEffect, useState } from "react"

import { SidebarFollowing } from "./_sidebar/SidebarFollowing"
import { SidebarNav } from "./_sidebar/SidebarNav"
import { SidebarProfileCard } from "./_sidebar/SidebarProfileCard"
import { SidebarToggle } from "./_sidebar/SidebarToggle"

const STORAGE_KEY = "sns-battle.sidebar.collapsed"

export type FollowingUser = {
  avatarEmoji: string
  id: number
  isLive: boolean
  name: string
  username: string
  viewerCount?: number
}

const MOCK_FOLLOWING: ReadonlyArray<FollowingUser> = [
  { avatarEmoji: "🎸", id: 1, isLive: true, name: "ギターマスター", username: "guitar_master", viewerCount: 1234 },
  { avatarEmoji: "🎮", id: 2, isLive: false, name: "ゲーマーX", username: "gamer_x" },
  { avatarEmoji: "🎨", id: 3, isLive: false, name: "アート太郎", username: "art_taro" },
]

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "true") setCollapsed(true)
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  return (
    <aside
      className="fixed left-0 top-14 z-40 flex h-[calc(100vh-56px)] flex-col transition-all duration-300"
      style={{
        backdropFilter: "blur(12px)",
        background:
          "linear-gradient(180deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.9) 100%)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        width: collapsed ? 68 : 240,
      }}
    >
      <SidebarToggle collapsed={collapsed} onToggle={toggle} />
      <SidebarNav collapsed={collapsed} />
      <SidebarFollowing collapsed={collapsed} users={MOCK_FOLLOWING} />
      <SidebarProfileCard collapsed={collapsed} />
    </aside>
  )
}
```

### `_sidebar/SidebarToggle.tsx`

```typescript
"use client"

type Props = {
  collapsed: boolean
  onToggle: () => void
}

export function SidebarToggle({ collapsed, onToggle }: Props) {
  return (
    <div className="flex justify-center py-3">
      <button
        aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition hover:bg-white/[0.05] hover:text-white"
        onClick={onToggle}
        type="button"
      >
        {collapsed ? "▸" : "◂"}
      </button>
    </div>
  )
}
```

### `_sidebar/SidebarNav.tsx`

```typescript
"use client"

import { usePathname } from "next/navigation"

import { SIDEBAR_NAV_ITEMS } from "./nav-items"
import { SidebarNavItem } from "./SidebarNavItem"

type Props = {
  collapsed: boolean
}

export function SidebarNav({ collapsed }: Props) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {SIDEBAR_NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href))
        return (
          <SidebarNavItem
            collapsed={collapsed}
            isActive={isActive}
            item={item}
            key={item.href}
          />
        )
      })}
    </nav>
  )
}
```

### `_sidebar/SidebarNavItem.tsx`

```typescript
"use client"

import Link from "next/link"

import type { SidebarNavItem as Item } from "./nav-items"

type Props = {
  collapsed: boolean
  isActive: boolean
  item: Item
}

export function SidebarNavItem({ collapsed, isActive, item }: Props) {
  const base = "flex h-10 items-center gap-3 rounded-lg text-sm transition"
  const active = "border border-primary-border bg-primary-glow text-primary"
  const inactive = "border border-transparent text-text-muted hover:bg-white/[0.03] hover:text-white"
  const padding = collapsed ? "justify-center px-2" : "px-3"

  return (
    <Link
      className={[base, isActive ? active : inactive, padding].join(" ")}
      href={item.href}
      title={collapsed ? item.label : undefined}
    >
      <span className="text-lg leading-none">{item.emoji}</span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
    </Link>
  )
}
```

### `_sidebar/SidebarFollowing.tsx`

```typescript
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
                    <span className="text-[10px] text-text-muted">
                      <span className="text-error">LIVE</span>
                      <span className="ml-1.5">
                        {user.viewerCount.toLocaleString()}視聴
                      </span>
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
```

### `_sidebar/SidebarProfileCard.tsx`

```typescript
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
```

### `app-shell.tsx` への差し込み

step2 のコードに対し、サイドバープレースホルダーを `<Sidebar />` に置き換える。

```typescript
return (
  <>
    <Navbar />
    <Sidebar />
    <main className="ml-60 mt-14 p-6 transition-all duration-300">{children}</main>
  </>
)
```

折りたたみ時に `<main>` のマージンも追従させたい場合は、`Sidebar` から状態を持ち上げて Context（`SidebarContext`）で配信する案もあるが、スコープ拡大を避けるため今 step では **`ml-60` 固定** で進める。折りたたみ時に若干の隙間ができるが許容する。後日 Context 化する TODO コメントを残す。

```typescript
{/* TODO(future): Sidebar の collapsed 状態を Context で配信して main の ml を追従させる */}
<main className="ml-60 mt-14 p-6 transition-all duration-300">{children}</main>
```

## 動作確認

### ビジュアル確認

`pnpm dev` 後、`http://localhost:3000/` にアクセス。

1. 左に幅 240px のサイドバーが Navbar 直下から画面下まで表示される
2. ナビ 6 項目（ホーム / 配信 / マッチング / バトル / 検索 / プロフィール）が並ぶ
3. 「ホーム」項目がアクティブ（パープル枠 + パープルグロー背景）
4. 「フォロー中」セクションに 3 ユーザー、最上位のギターマスターに緑ドットと LIVE 1,234視聴
5. 最下部にプロフィールカード（K アバター + ケンタ + @kenta）

### アクティブ判定の確認

- `/matching` に遷移 → 「マッチング」がアクティブに変わる
- `/battles/123` → AppShell が immersive と判定するためサイドバー自体が非表示

### 折りたたみ動作の確認

1. トグルボタン `◂` をクリック → 幅が 68px に縮小、ラベル非表示、アイコン中央配置
2. フォロー中セクションは LIVE 中ユーザー（1 件）のみ表示
3. リロード → 折りたたみ状態が保持される（localStorage）
4. 再度クリック `▸` → 240px に展開、リロードでも展開状態保持

### キーボード/ホバー確認

- ナビ項目をタブで巡回できる
- 折りたたみ時は `title` 属性でツールチップが出る
- ホバー時に非アクティブ項目の背景がうっすら明るくなる

### モード別の表示

| パス | サイドバー |
|------|----------|
| `/` | 表示 |
| `/sign-in` | 非表示（immersive） |
| `/battles` | 非表示（no-sidebar） |
| `/battles/123` | 非表示（immersive） |
| `/matching/session` | 非表示（immersive） |

### 既知の未対応

- フォロー中ユーザーのリアルタイムデータ取得は Phase 5（social）で実装。今 step ではモック
- 折りたたみ時の `<main>` マージン追従は TODO（Context 化案）
- `/profile/me`、`/stream/me` 等の遷移先ページは Phase 3 / Phase 6 で実装
