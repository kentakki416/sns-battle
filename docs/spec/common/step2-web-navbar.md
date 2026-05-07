# step2-web-navbar.md

`<Navbar>` を実装し、step1 の `<AppShell>` プレースホルダーと差し替える。上部固定（高さ 56px）でロゴ・検索バー・マッチング開始 CTA・通知ベル・アバターの 5 要素を配置する。

UI 仕様は `docs/spec/common/README.md` の [Navbar](./README.md#navbar上部固定-56px--appswebsrccomponentslayoutnavbartsx) を参照。

## 対応内容

### ファイル構成

```
apps/web/src/components/layout/
├── navbar.tsx              ← Client Component（ロゴ + 検索 + アクション群）
└── _navbar/
    ├── NavbarLogo.tsx      ← Client（ブランドロゴ）
    ├── NavbarSearch.tsx    ← Client（検索バー、Enter で /search?q= 遷移）
    ├── MatchingCta.tsx     ← Client（マッチング開始 CTA + シマー演出）
    ├── NotificationBell.tsx ← Client（通知ベル + バッジ。データ取得は将来 step）
    └── NavbarAvatar.tsx    ← Client（自分のプロフィールへのリンク）
```

`_navbar` プレフィックスにより App Router のルートとして解釈されない。Navbar は Client Component（`useRouter` / `useState` を使うため）。

### `navbar.tsx`

```typescript
"use client"

import { MatchingCta } from "./_navbar/MatchingCta"
import { NavbarAvatar } from "./_navbar/NavbarAvatar"
import { NavbarLogo } from "./_navbar/NavbarLogo"
import { NavbarSearch } from "./_navbar/NavbarSearch"
import { NotificationBell } from "./_navbar/NotificationBell"

export function Navbar() {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between px-5"
      style={{
        backdropFilter: "blur(16px) saturate(180%)",
        background: "rgba(17, 25, 40, 0.75)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <NavbarLogo />
      <NavbarSearch />
      <div className="flex items-center gap-3">
        <MatchingCta />
        <NotificationBell unreadCount={3} />
        <NavbarAvatar />
      </div>
    </header>
  )
}
```

`unreadCount` は将来 `GET /api/notifications/unread-count` から取得する想定。今 step では固定値 3 を渡す。

### `_navbar/NavbarLogo.tsx`

```typescript
"use client"

import Link from "next/link"

export function NavbarLogo() {
  return (
    <Link className="flex items-center gap-2.5" href="/">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
        style={{
          background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
          boxShadow: "0 0 20px rgba(203,172,249,0.3)",
        }}
      >
        ⚡
      </span>
      <span className="text-base font-semibold tracking-tight text-white">
        SNS Battle
      </span>
    </Link>
  )
}
```

### `_navbar/NavbarSearch.tsx`

`md:` 以上で表示、Enter キーで `/search?q=...` に遷移。

```typescript
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
```

### `_navbar/MatchingCta.tsx`

`/matching` への Link。グラデ背景 + ホバー時シマー演出。`animate-shimmer` は `globals.css` に定義済み。

```typescript
"use client"

import Link from "next/link"

export function MatchingCta() {
  return (
    <Link
      className="hidden h-9 items-center rounded-lg px-4 text-sm font-semibold text-white transition hover:animate-shimmer sm:inline-flex"
      href="/matching"
      style={{
        background:
          "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 50%, #CBACF9 100%)",
        backgroundSize: "200% 100%",
        boxShadow: "0 0 20px rgba(203,172,249,0.25)",
      }}
    >
      マッチング開始
    </Link>
  )
}
```

### `_navbar/NotificationBell.tsx`

```typescript
"use client"

type Props = {
  unreadCount: number
}

export function NotificationBell({ unreadCount }: Props) {
  return (
    <button
      aria-label="通知"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lg text-text-muted transition hover:bg-white/[0.05] hover:text-white"
      type="button"
    >
      🔔
      {unreadCount > 0 && (
        <span
          className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: "#EC4899" }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  )
}
```

### `_navbar/NavbarAvatar.tsx`

`/profile/me` への Link。実画像取得は Phase 3 で対応するので、ここではグラデ背景 + 仮のイニシャル `K` を表示する。

```typescript
"use client"

import Link from "next/link"

export function NavbarAvatar() {
  return (
    <Link
      aria-label="プロフィール"
      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition hover:shadow-[0_0_16px_rgba(203,172,249,0.5)]"
      href="/profile/me"
      style={{
        background: "linear-gradient(135deg, #CBACF9 0%, #EC4899 100%)",
      }}
    >
      K
    </Link>
  )
}
```

### `app-shell.tsx` への差し込み

step1 で配置した `data-slot="navbar-placeholder"` を `<Navbar />` で置き換える。

```typescript
"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  IMMERSIVE_PATH_PREFIXES,
  NO_SIDEBAR_PATHS,
  isBattleDetailPath,
} from "./app-shell.constants"
import { Navbar } from "./navbar"

type Props = {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const pathname = usePathname()

  const isImmersive =
    isBattleDetailPath(pathname) ||
    IMMERSIVE_PATH_PREFIXES.some((p) => pathname.startsWith(p))

  const isNoSidebar = NO_SIDEBAR_PATHS.includes(pathname)

  if (isImmersive) {
    return <main className="min-h-screen bg-dark-base">{children}</main>
  }

  if (isNoSidebar) {
    return (
      <>
        <Navbar />
        <main className="mt-14 p-6">{children}</main>
      </>
    )
  }

  return (
    <>
      <Navbar />
      {/* TODO(step3): <Sidebar /> をここに配置 */}
      <div className="w-60" data-slot="sidebar-placeholder" />
      <main className="ml-60 mt-14 p-6">{children}</main>
    </>
  )
}
```

### `globals.css` の `animate-shimmer` 確認

`docs/spec/README.md` のグローバルスタイルクラスに記載があるとおり、`globals.css` に下記が必要。未定義なら追加する。

```css
@keyframes shimmer {
  0% { background-position: 0 0; }
  100% { background-position: -200% 0; }
}

.animate-shimmer {
  animation: shimmer 2s linear infinite;
}
```

## 動作確認

### ビジュアル確認

`pnpm dev` 後、以下を目視確認。

1. `http://localhost:3000/` にアクセス
   - 上部に高さ 56px の半透明バー（背景がぼやけて見える）
   - 左にロゴ「⚡ SNS Battle」、中央に検索バー、右に「マッチング開始」「🔔3」「アバター」
   - 「マッチング開始」にホバーするとシマー演出（グラデーションが横に流れる）
2. `http://localhost:3000/sign-in`
   - Navbar が **表示されない**（immersive モード）
3. `http://localhost:3000/battles`
   - Navbar が表示され、サイドバープレースホルダーは出ない（no-sidebar モード）

### 検索バーの動作確認

1. 検索バーに `テスト` と入力 → Enter
2. URL が `/search?q=%E3%83%86%E3%82%B9%E3%83%88` に遷移
3. `/search` 自体は未実装のため 404 が出るが Navbar からの遷移挙動はこれで OK

### CTA / アバターの動作確認

- 「マッチング開始」クリック → `/matching` に遷移（404 になるが Navbar 自体は問題なし）
- アバタークリック → `/profile/me` に遷移（404 になるが Navbar 自体は問題なし）
- 通知ベル: クリックしても何も起きない（パネル開閉は将来 step）

### レスポンシブ確認

- 幅 < 640px: マッチング開始 CTA が非表示
- 幅 < 768px: 検索バーが非表示
- 幅 ≥ 768px: 全要素表示

### アクセシビリティ

- 通知ベル / アバターに `aria-label` が付与されている
- 検索 input は `type="search"`
- Tab フォーカスがロゴ → 検索 → マッチング開始 → 通知 → アバターの順で進む

### 既知の未対応

- 通知ベルクリックで通知パネルを開く処理（Phase 3 以降）
- アバターのアニメーション（実画像取得は Phase 3）
- 未読数のリアルタイム取得（固定値 3）
