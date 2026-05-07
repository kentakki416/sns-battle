# step1-web-app-shell.md

`<AppShell>` を実装する。`apps/web/src/app/layout.tsx` から呼び出され、`usePathname()` 経由で現在のパスを判定し **immersive / no-sidebar / default** の 3 モードを切り替える Client Component。

UI 仕様は `docs/spec/common/README.md` の [AppShell](./README.md#appshellappswebsrccomponentslayoutapp-shelltsx) を参照。

この step では Navbar / Sidebar の実装は行わない。後続 step（step2 / step3）で実装する具体コンポーネントを差し込めるよう、**プレースホルダー（空 div + コメント）** で配置スロットだけ確保する。

## 対応内容

### ファイル構成

```
apps/web/src/components/layout/
├── app-shell.tsx           ← Client Component（パス判定 + モード切替）
└── app-shell.constants.ts  ← immersive / no-sidebar の対象パス定義
```

### `app-shell.constants.ts`

切替対象のパスを定数化。`AppShell` 本体と将来のテストの両方から参照する。

```typescript
/**
 * Navbar / Sidebar をともに非表示にする immersive モードの対象パス（前方一致）。
 * `/battles/{id}` は別関数 isBattleDetailPath で判定する（一覧 `/battles` を除外するため）。
 */
export const IMMERSIVE_PATH_PREFIXES: ReadonlyArray<string> = [
  "/sign-in",
  "/stream/",
  "/matching/session",
]

/**
 * Navbar のみ表示しサイドバーを非表示にするパス（完全一致）。
 */
export const NO_SIDEBAR_PATHS: ReadonlyArray<string> = [
  "/battles",
]

export const isBattleDetailPath = (pathname: string): boolean => {
  return pathname.startsWith("/battles/") && pathname !== "/battles"
}
```

### `app-shell.tsx`

```typescript
"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  IMMERSIVE_PATH_PREFIXES,
  NO_SIDEBAR_PATHS,
  isBattleDetailPath,
} from "./app-shell.constants"

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
        {/* TODO(step2): <Navbar /> をここに配置 */}
        <div className="h-14" data-slot="navbar-placeholder" />
        <main className="mt-14 p-6">{children}</main>
      </>
    )
  }

  return (
    <>
      {/* TODO(step2): <Navbar /> をここに配置 */}
      <div className="h-14" data-slot="navbar-placeholder" />
      {/* TODO(step3): <Sidebar /> をここに配置 */}
      <div className="w-60" data-slot="sidebar-placeholder" />
      <main className="ml-60 mt-14 p-6">{children}</main>
    </>
  )
}
```

### `apps/web/src/app/layout.tsx` への組み込み

既存の `RootLayout` の `<body>` 直下を `<AppShell>` で包む。

```typescript
import "./globals.css"

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { AppShell } from "@/components/layout/app-shell"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  description: "リアルタイムで、つながる。配信・マッチング・バトルを楽しもう。",
  title: "SNS Battle",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
```

`@/` パスエイリアスは `apps/web/tsconfig.json` で `baseUrl: "./src"` として既に有効化されている前提。未設定なら `compilerOptions.paths` に `"@/*": ["./src/*"]` を追加する。

### `/sign-in/layout.tsx` の整理

step5（auth）で暫定配置していた `apps/web/src/app/sign-in/layout.tsx` は AppShell が immersive を担当するため不要になる。**ただし削除は行わない**（step5 でファイルが追跡されているため、空のままで問題なし）。

## 動作確認

### 開発サーバー起動

```bash
pnpm dev
```

### モード切替の確認

各パスにアクセスし、placeholder の表示有無で切替が効いていることを目視確認する。Sidebar / Navbar 本体は未実装なので「灰色の枠」が出れば OK。

| パス | 期待モード | navbar slot | sidebar slot |
|------|-----------|-------------|--------------|
| `/` | default | 表示 | 表示 |
| `/sign-in` | immersive | 非表示 | 非表示 |
| `/battles` | no-sidebar | 表示 | 非表示 |
| `/battles/123` | immersive | 非表示 | 非表示 |
| `/matching` | default | 表示 | 表示 |
| `/matching/session` | immersive | 非表示 | 非表示 |
| `/stream/foo` | immersive | 非表示 | 非表示 |

確認には DevTools で `[data-slot="navbar-placeholder"]` / `[data-slot="sidebar-placeholder"]` の有無を見る。

### `/sign-in` のリグレッション確認

Phase 1 step5 で実装したサインインページが immersive モードで従来通り表示されること（背景・カードが画面いっぱいに広がり、上部や左端に余白が増えていないこと）。

### 既知の未対応

- Navbar / Sidebar 本体は未実装。step2 / step3 で差し込む
- `/profile/...`、`/search` 等の未実装ルートは default モードに振り分けられるが、ページ自体が 404 になる（Phase 3 以降で実装）
