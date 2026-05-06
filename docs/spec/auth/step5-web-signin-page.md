# step5-web-signin-page.md

`/sign-in` ページを実装する。`docs/spec/auth/README.md` の「ログインページ（/sign-in）」UI 仕様に従い、immersive レイアウト（ナビバー・サイドバーなし）で左ブランド + 右サインインカードの 2 カラム構成。フローティングオーブ背景 + グリッドパターン + Framer Motion アニメーション。

step4 で配線した `startGoogleOAuth` Server Action を Google ボタンから呼び出す。TikTok / X / Instagram は `enabled: false` で disabled 表示。

## 対応内容

### ファイル構成

```
apps/web/src/app/sign-in/
├── page.tsx              ← Server Component（ルート + クエリパラメータからのエラー表示）
├── actions.ts            ← step4 で作成済み（startGoogleOAuth）
├── _components/
│   ├── SignInBackground.tsx     ← Client（オーブ群アニメーション）
│   ├── BrandPanel.tsx           ← Client（左ブランドエリア。framer-motion）
│   ├── SignInCard.tsx           ← Client（右カード本体）
│   └── ProviderButton.tsx       ← Client（OAuth ボタン）
```

`_components` プレフィックスにすることで App Router のルートとして解釈されない。

### プロバイダー定義

`apps/web/src/app/sign-in/_components/providers.ts`:

```typescript
export type Provider = {
  enabled: boolean
  iconBg: string
  iconLabel: string
  id: "google" | "tiktok" | "twitter" | "instagram"
  label: string
}

export const PROVIDERS: ReadonlyArray<Provider> = [
  { enabled: true, iconBg: "#FFFFFF", iconLabel: "G", id: "google", label: "Google" },
  { enabled: false, iconBg: "#000000", iconLabel: "T", id: "tiktok", label: "TikTok" },
  { enabled: false, iconBg: "#1DA1F2", iconLabel: "X", id: "twitter", label: "X" },
  { enabled: false, iconBg: "#E4405F", iconLabel: "I", id: "instagram", label: "Instagram" },
]
```

### `page.tsx`（Server Component）

```typescript
import type { Metadata } from "next"

import { BrandPanel } from "./_components/BrandPanel"
import { SignInBackground } from "./_components/SignInBackground"
import { SignInCard } from "./_components/SignInCard"

export const metadata: Metadata = {
  title: "サインイン | SNS Battle",
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-dark-base">
      <SignInBackground />

      <div className="relative z-10 flex w-full max-w-5xl items-center justify-between gap-16 px-8">
        <BrandPanel />
        <SignInCard error={error} />
      </div>
    </main>
  )
}
```

### `SignInBackground.tsx`

5 個の motion 円 + グリッドパターン。`pointer-events-none` で操作不可。

```typescript
"use client"

import { motion } from "framer-motion"

type Orb = {
  blur: number
  color: string
  delay: number
  size: number
  x: string
  y: string
}

const ORBS: ReadonlyArray<Orb> = [
  { blur: 100, color: "rgba(203,172,249,0.08)", delay: 0, size: 400, x: "15%", y: "20%" },
  { blur: 120, color: "rgba(14,165,233,0.07)", delay: 2, size: 500, x: "75%", y: "70%" },
  { blur: 90, color: "rgba(236,72,153,0.05)", delay: 4, size: 350, x: "50%", y: "10%" },
  { blur: 110, color: "rgba(203,172,249,0.06)", delay: 6, size: 450, x: "10%", y: "80%" },
  { blur: 100, color: "rgba(14,165,233,0.06)", delay: 8, size: 380, x: "85%", y: "30%" },
]

export function SignInBackground() {
  return (
    <>
      <div className="bg-grid-pattern pointer-events-none absolute inset-0 opacity-20" />
      {ORBS.map((orb, i) => (
        <motion.div
          key={i}
          animate={{ x: [0, 30, -20, 0], y: [0, -40, 20, 0] }}
          className="pointer-events-none absolute rounded-full"
          style={{
            background: `radial-gradient(circle, ${orb.color} 0%, transparent 70%)`,
            filter: `blur(${orb.blur}px)`,
            height: orb.size,
            left: orb.x,
            top: orb.y,
            width: orb.size,
          }}
          transition={{
            delay: orb.delay,
            duration: 20,
            ease: "easeInOut",
            repeat: Infinity,
            repeatType: "mirror",
          }}
        />
      ))}
    </>
  )
}
```

### `BrandPanel.tsx`

左ブランドエリア（`hidden lg:flex` でモバイル非表示）。

```typescript
"use client"

import { motion } from "framer-motion"

const FEATURES = [
  { emoji: "🎥", label: "ライブ配信" },
  { emoji: "🤝", label: "マッチング" },
  { emoji: "⚔️", label: "バトル" },
]

export function BrandPanel() {
  return (
    <div className="hidden flex-1 flex-col gap-8 lg:flex">
      <motion.div
        animate={{ rotate: [0, 5, -5, 0], scale: 1 }}
        className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl"
        initial={{ scale: 0 }}
        style={{
          background: "linear-gradient(135deg, rgba(203,172,249,0.3), rgba(14,165,233,0.3))",
          boxShadow: "0 0 40px rgba(203,172,249,0.15), 0 0 80px rgba(14,165,233,0.1)",
        }}
        transition={{
          rotate: { duration: 4, ease: "easeInOut", repeat: Infinity },
          scale: { stiffness: 200, type: "spring" },
        }}
      >
        ⚡
      </motion.div>

      <h1 className="text-5xl font-bold leading-tight">
        SNS
        <span className="bg-gradient-to-r from-primary via-cyan to-accent-pink bg-clip-text text-transparent">
          {" "}Battle
        </span>
      </h1>

      <p className="text-lg leading-relaxed text-text-muted">
        リアルタイムで、つながる。
        <br />
        ライブ配信、1対1マッチング、バトル。
        <br />
        新しい出会いが、ここから始まる。
      </p>

      <div className="flex flex-wrap gap-3">
        {FEATURES.map((f, i) => (
          <motion.span
            key={f.label}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full border border-dark-border bg-dark-surface/50 px-4 py-2 text-sm text-text-secondary backdrop-blur"
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.8 + i * 0.15 }}
          >
            {f.emoji} {f.label}
          </motion.span>
        ))}
      </div>
    </div>
  )
}
```

### `SignInCard.tsx`

右カード本体。Google ボタンは `<form action={startGoogleOAuth}>` で Server Action を起動。

```typescript
"use client"

import { motion } from "framer-motion"

import { startGoogleOAuth } from "../actions"
import { ProviderButton } from "./ProviderButton"
import { PROVIDERS } from "./providers"

type Props = {
  error?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "認証に失敗しました。もう一度お試しください。",
  invalid_request: "リクエストが不正です。",
  oauth_denied: "Google アカウントへのアクセスが拒否されました。",
  state_mismatch: "セッションが切れました。もう一度お試しください。",
}

export function SignInCard({ error }: Props) {
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "エラーが発生しました。" : null

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-3xl p-[1px]"
      initial={{ opacity: 0, y: 20 }}
      style={{
        background: "linear-gradient(135deg, rgba(203,172,249,0.2), rgba(14,165,233,0.15), rgba(236,72,153,0.1))",
      }}
      transition={{ duration: 0.6 }}
    >
      <div
        className="rounded-3xl px-8 py-10"
        style={{
          background: "linear-gradient(135deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.85) 100%)",
          backdropFilter: "blur(40px)",
        }}
      >
        <div className="mb-8 hidden lg:block">
          <h2 className="text-2xl font-semibold">サインイン</h2>
          <p className="mt-1 text-sm text-text-muted">アカウントに接続して始めましょう</p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {PROVIDERS.map((p, i) => (
            <motion.div
              key={p.id}
              animate={{ opacity: 1, x: 0 }}
              initial={{ opacity: 0, x: -20 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              {p.id === "google" ? (
                <form action={startGoogleOAuth}>
                  <ProviderButton provider={p} type="submit" />
                </form>
              ) : (
                <ProviderButton provider={p} type="button" />
              )}
            </motion.div>
          ))}
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-[1px] flex-1 bg-white/[0.06]" />
          <span className="text-xs text-text-disabled">その他のオプション</span>
          <div className="h-[1px] flex-1 bg-white/[0.06]" />
        </div>

        <button
          className="w-full rounded-xl border border-dashed border-white/[0.08] py-3 text-sm text-text-muted transition hover:text-white"
          type="button"
        >
          ゲストとして見学する
        </button>

        <p className="mt-6 text-xs leading-relaxed text-text-disabled">
          サインインすることで、利用規約 と プライバシーポリシー に同意したものとみなされます。
        </p>
      </div>
    </motion.div>
  )
}
```

### `ProviderButton.tsx`

```typescript
"use client"

import type { Provider } from "./providers"

type Props = {
  provider: Provider
  type: "button" | "submit"
}

export function ProviderButton({ provider, type }: Props) {
  const disabled = !provider.enabled
  return (
    <button
      className={[
        "group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm transition",
        disabled
          ? "cursor-not-allowed border border-white/[0.04] bg-white/[0.02] text-text-disabled"
          : "border border-white/10 bg-white/[0.06] text-white hover:shadow-[0_0_20px_rgba(203,172,249,0.1)]",
      ].join(" ")}
      disabled={disabled}
      type={type}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
        style={{ backgroundColor: provider.iconBg, color: provider.id === "google" ? "#202124" : "#FFFFFF" }}
      >
        {provider.iconLabel}
      </span>
      <span className="flex-1 text-left">
        {provider.label} でサインイン{disabled ? "（準備中）" : ""}
      </span>
      {!disabled && (
        <span className="opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">→</span>
      )}
    </button>
  )
}
```

### immersive レイアウト

`/sign-in` 配下では Navbar / Sidebar を出さない。Phase 2 で `<AppShell>` を作るまでの暫定として、`apps/web/src/app/sign-in/layout.tsx` を作成して既存の共通レイアウトを上書きしないようにする（現状 `app/layout.tsx` には Navbar 等が無いため初期段階では追加レイアウト不要だが、ファイル設置で immersive 領域を明示する）。

```typescript
import type { ReactNode } from "react"

export default function SignInLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
```

## 動作確認

### 開発サーバー起動

```bash
pnpm dev
```

### ビジュアル確認

1. `http://localhost:3000/sign-in` にアクセス
2. 期待する見た目:
   - 全画面ダーク背景 + グリッド + 5 個の浮遊オーブ（位置・色・遅延の差で 20 秒周期で動く）
   - 1024px 以上で左にブランド、右にカードの 2 カラム
   - 1024px 未満ではカードのみ中央表示
   - Google ボタンのみ enabled、その他 3 つは disabled で「（準備中）」表記
   - カード外枠に薄いカラフルグラデ（パープル → シアン → ピンク）
3. Lighthouse で "Largest Contentful Paint" が 2.5 秒以下

### Google サインインの動作確認

step4 と組み合わせた E2E:

1. Google ボタンクリック → Google 認証画面に遷移
2. 認証同意 → `/api/auth/callback/google?code=...&state=...`
3. 新規ユーザーは `/onboarding` に、既存ユーザーは `/` にリダイレクト
4. Cookie に `sb_access_token` / `sb_refresh_token` がセットされる

### エラー表示の確認

クエリパラメータでエラー文言が出ること:

- `/sign-in?error=auth_failed` → 「認証に失敗しました。もう一度お試しください。」
- `/sign-in?error=oauth_denied` → 「Google アカウントへのアクセスが拒否されました。」
- `/sign-in?error=invalid_request` → 「リクエストが不正です。」
- `/sign-in?error=state_mismatch` → 「セッションが切れました。もう一度お試しください。」

### アクセシビリティ

- Tab キーで Google ボタン → ゲストボタンの順にフォーカスが移動すること
- disabled プロバイダーは Tab スキップされない（フォーカスは行くが非活性が分かること）
- `aria-disabled` の代わりに `disabled` 属性を使うことでスクリーンリーダーで非活性が読み上げられること

### 既知の未対応

- ゲスト見学（onClick で `/` 等への直接遷移は今 step では未配線。クリックしても何も起きない）。Phase 2 のホーム画面実装と同時に有効化する
- TikTok / X / Instagram の OAuth は `enabled: true` に切り替えるだけで対応できる構造（実際の OAuth 連携は Phase 8 以降）
