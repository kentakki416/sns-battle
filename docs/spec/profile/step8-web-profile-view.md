# step8-web-profile-view.md

`/profile/[id]/page.tsx` を実装する。指定 `id` のユーザーのプロフィールを表示するページ。`/profile/me` で自分のプロフィールにリダイレクトするルートも作る。

UI 仕様は `docs/spec/profile/README.md` の [プロフィール表示（/profile/:id）](./README.md#プロフィール表示profileid) を参照。AppShell（Phase 2 step1）の **default モード**で動作する。

依存: step2（GET API）。step6 の `MatchingPreference` 取得 API は本ページでは使わない（フィルタは編集ページ専用）。配信履歴・バトル戦績は **空状態 UI** をプレースホルダで配置する（実 API は Phase 6 / Phase 7）。

## 表示項目

| セクション | 自分（is_self=true） | 他人（is_self=false） |
|----------|--------------------|-----------------------|
| カバー + アバター + 名前 + 年齢 | ◯ | ◯ |
| bio | ◯ | ◯ |
| **MBTI** | ◯（編集可） | ◯（表示のみ） |
| **居住地域** | ◯ | ◯ |
| **趣味** | ◯（chip 表示） | ◯（chip 表示） |
| 配信履歴 | 空状態 UI | 空状態 UI |
| バトル戦績 | 空状態 UI | 空状態 UI |
| プロフィール編集ボタン | ◯ | × |
| フォローボタン | × | ◯（disabled） |

## 対応内容

### ファイル構成

```
apps/web/src/app/profile/
├── [id]/
│   └── page.tsx
├── me/
│   └── page.tsx                  ← /profile/me → /profile/{id} redirect
└── _components/
    ├── ProfileHeaderCard.tsx     ← Client（カバー + アバター + 名前 + 年齢 + アクション）
    ├── ProfileDetailSection.tsx  ← Server（MBTI / 居住地域 / 趣味の表示）
    ├── EmptyStreamHistory.tsx    ← Server（配信履歴の空状態）
    └── EmptyBattleStats.tsx      ← Server（戦績の空状態）
```

### `/profile/me/page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

export default async function ProfileMePage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")
  redirect(`/profile/${me.id}`)
}
```

### `/profile/[id]/page.tsx`

```typescript
import { notFound, redirect } from "next/navigation"

import { type GetUserResponse, getUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { EmptyBattleStats } from "../_components/EmptyBattleStats"
import { EmptyStreamHistory } from "../_components/EmptyStreamHistory"
import { ProfileDetailSection } from "../_components/ProfileDetailSection"
import { ProfileHeaderCard } from "../_components/ProfileHeaderCard"

type Props = {
  params: Promise<{ id: string }>
}

export const metadata = {
  title: "プロフィール | SNS Battle",
}

export default async function ProfileDetailPage({ params }: Props) {
  const { id: idParam } = await params
  const id = Number(idParam)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  let profile: GetUserResponse
  try {
    const json = await apiClient.get<unknown>(`/api/users/${id}`)
    profile = getUserResponseSchema.parse(json)
  } catch {
    notFound()
  }

  return (
    <div className="relative mx-auto max-w-2xl">
      <div
        aria-hidden
        className="pointer-events-none fixed -left-32 -top-32 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(203,172,249,0.08) 0%, transparent 70%)",
          filter: "blur(120px)",
        }}
      />

      <ProfileHeaderCard isMyProfile={profile.is_self} profile={profile} />

      <ProfileDetailSection profile={profile} />

      <section className="mt-8">
        <SectionHeader emoji="📺" tone="error" title="ライブ配信履歴" />
        <EmptyStreamHistory />
      </section>

      <section className="mt-8">
        <SectionHeader emoji="⚔️" tone="pink" title="バトル戦績" />
        <EmptyBattleStats />
      </section>
    </div>
  )
}

function SectionHeader({ emoji, title, tone }: { emoji: string; title: string; tone: "error" | "pink" }) {
  const bg = tone === "error" ? "bg-error/10" : "bg-accent-pink/10"
  return (
    <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-white">
      <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${bg}`}>{emoji}</span>
      {title}
    </h2>
  )
}
```

### `_components/ProfileHeaderCard.tsx`（Client）

カバーグラデ + アバター + 名前 + 年齢 + bio + アクションボタン。step6 の元仕様 + 「マッチングフィルタ」リンクを追加。

```typescript
"use client"

import Link from "next/link"

import type { GetUserResponse } from "@repo/api-schema"

type Props = {
  isMyProfile: boolean
  profile: GetUserResponse
}

export function ProfileHeaderCard({ isMyProfile, profile }: Props) {
  return (
    <article className="overflow-hidden rounded-2xl border border-dark-border bg-dark-surface/60 backdrop-blur">
      <div
        aria-hidden
        className="h-24 w-full"
        style={{
          background:
            "linear-gradient(90deg, rgba(203,172,249,0.2) 0%, rgba(14,165,233,0.1) 50%, rgba(236,72,153,0.2) 100%)",
        }}
      />

      <div className="p-6">
        <div className="-mt-14 flex items-end gap-4">
          <span
            className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full text-3xl font-bold text-white ring-4 ring-dark-base"
            style={{
              backgroundImage: profile.avatar_url ? `url(${profile.avatar_url})` : undefined,
              backgroundPosition: "center",
              backgroundSize: "cover",
              background: profile.avatar_url
                ? undefined
                : "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
              boxShadow: "0 0 24px rgba(203,172,249,0.3)",
            }}
          >
            {!profile.avatar_url && (profile.name?.charAt(0) ?? "?")}
          </span>

          <div className="flex-1 pb-1">
            <h1 className="text-xl font-bold text-white">{profile.name ?? "(no name)"}</h1>
            {profile.age !== null && (
              <p className="text-xs text-text-muted">{profile.age} 歳</p>
            )}
          </div>
        </div>

        {profile.bio && (
          <p className="mt-4 whitespace-pre-wrap text-sm text-text-secondary">{profile.bio}</p>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-4 text-sm text-text-muted">
            {/** Phase 5 まで実数なし */}
            <span><span className="font-semibold text-white">0</span> フォロワー</span>
            <span><span className="font-semibold text-white">0</span> フォロー中</span>
          </div>

          {isMyProfile ? (
            <div className="flex items-center gap-2">
              <Link
                className="rounded-lg border border-dark-border bg-dark-base px-4 py-2 text-sm text-white transition hover:bg-white/[0.03]"
                href="/profile/edit"
              >
                プロフィール編集
              </Link>
              <Link
                className="rounded-lg border border-dark-border bg-dark-base px-4 py-2 text-sm text-text-muted transition hover:text-white"
                href="/matching/preferences"
              >
                マッチングフィルタ
              </Link>
            </div>
          ) : (
            <button
              className="rounded-lg px-4 py-2 text-sm font-semibold text-dark-base transition"
              disabled
              style={{ background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)" }}
              type="button"
            >
              フォロー
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
```

### `_components/ProfileDetailSection.tsx`（Server）

MBTI / 居住地域 / 趣味の表示。値が無いセクションは「未設定」と表示。

```typescript
import type { GetUserResponse } from "@repo/api-schema"

type Props = {
  profile: GetUserResponse
}

export function ProfileDetailSection({ profile }: Props) {
  const hasAny = profile.mbti || profile.location || profile.hobbies.length > 0
  if (!hasAny && !profile.is_self) return null

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-dark-border bg-dark-surface/60 p-5 backdrop-blur">
      <DetailRow label="MBTI" value={profile.mbti ? <Pill text={profile.mbti} /> : <Empty />} />
      <DetailRow label="居住地域" value={profile.location ? <span>{profile.location}</span> : <Empty />} />
      <DetailRow
        label="趣味"
        value={
          profile.hobbies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.hobbies.map((h) => (
                <Pill key={h.id} text={h.name} />
              ))}
            </div>
          ) : (
            <Empty />
          )
        }
      />
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-20 flex-shrink-0 text-xs uppercase tracking-widest text-text-disabled">
        {label}
      </span>
      <div className="flex-1 text-sm text-white">{value}</div>
    </div>
  )
}

function Pill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary-border bg-primary-glow px-3 py-1 text-xs text-primary">
      {text}
    </span>
  )
}

function Empty() {
  return <span className="text-xs text-text-disabled">未設定</span>
}
```

### `_components/EmptyStreamHistory.tsx` / `EmptyBattleStats.tsx`

step6 と同じ。Phase 6 / Phase 7 までは空状態 UI。

```typescript
export function EmptyStreamHistory() {
  return (
    <div className="rounded-xl border border-dashed border-dark-border bg-dark-base/50 px-4 py-8 text-center">
      <p className="text-sm text-text-muted">まだ配信履歴がありません</p>
      <p className="mt-1 text-xs text-text-disabled">
        Phase 6 で配信機能が実装されると、ここに過去の配信が表示されます
      </p>
    </div>
  )
}

export function EmptyBattleStats() {
  return (
    <div className="rounded-xl border border-dashed border-dark-border bg-dark-base/50 px-4 py-8 text-center">
      <p className="text-sm text-text-muted">バトル戦績はまだありません</p>
      <p className="mt-1 text-xs text-text-disabled">
        Phase 7 でバトル機能が実装されると、ここに勝敗・勝率が表示されます
      </p>
    </div>
  )
}
```

### サイドバーからの遷移

Phase 2 step3 で `/profile/me` リンクが Sidebar にある。`/profile/me` → `/profile/{id}` のリダイレクト挙動を確認。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 自分の全項目設定済プロフィール

1. オンボーディングで全項目設定したアカウントでログイン
2. `/profile/me` → `/profile/{自分のid}`
3. ヘッダー右に「プロフィール編集」「マッチングフィルタ」ボタン
4. MBTI / 居住地域 / 趣味のセクションがそれぞれ Pill で表示
5. 配信履歴・戦績は空状態 UI

### シナリオ 2: 自分の必須項目のみ設定（任意は未設定）

1. オンボーディングで必須のみ設定したアカウントで `/profile/me`
2. MBTI / 居住地域 / 趣味のセクションは「未設定」表示
3. プロフィール編集リンクから補完可能

### シナリオ 3: 他人のプロフィール

1. `/profile/2`（自分以外）にアクセス
2. ヘッダー右に「フォロー」ボタン（disabled、Phase 5 で活性化）
3. MBTI / 居住地域 / 趣味は表示される（公開仕様）
4. birth_date / coin_balance はレスポンスで null（画面にも出ない）

### シナリオ 4: 他人で全項目未設定

1. 他人で MBTI / 居住地域 / 趣味すべて未設定
2. ProfileDetailSection 自体が非表示（`hasAny=false && !is_self`）

### シナリオ 5: 存在しない / 不正な id

1. `/profile/9999999` → 404
2. `/profile/abc` → 404

### シナリオ 6: 未ログイン / 未オンボーディング

1. ログアウト → `/sign-in` リダイレクト
2. `is_onboarded=false` で `/profile/me` → `/onboarding`

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

## 既知の未対応 / 後続 step に持ち越し

- フォロー / フォロー解除動作と数値表示は Phase 5
- 配信履歴・バトル戦績は Phase 6 / Phase 7
- 趣味マスターを多言語化する場合は将来対応
- アバター画像 404 のフォールバックは将来対応
