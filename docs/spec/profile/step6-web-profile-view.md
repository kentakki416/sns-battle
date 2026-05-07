# step6-web-profile-view.md

`/profile/[id]/page.tsx` を実装する。指定 `id` のユーザーのプロフィールを表示するページ。`/profile/me` で自分のプロフィールにリダイレクトするルートも作る。

UI 仕様は `docs/spec/profile/README.md` の [プロフィール表示（/profile/:id）](./README.md#プロフィール表示profileid) を参照。AppShell（Phase 2 step1）の **default モード**で動作する。

依存: step2（GET API）。step6 では実データのプロフィール本体のみ表示し、配信履歴 / バトル戦績は **空状態 UI** をプレースホルダで配置する（実 API は Phase 6 / Phase 7 で実装）。

## 対応内容

### ファイル構成

```
apps/web/src/app/profile/
├── [id]/
│   └── page.tsx                 ← Server Component（/profile/:id）
├── me/
│   └── page.tsx                 ← Server Component（/profile/me → /profile/{自分のid} に redirect）
└── _components/
    ├── ProfileHeaderCard.tsx    ← Client（カバー + アバター + 名前 + 統計 + アクション）
    ├── EmptyStreamHistory.tsx   ← Server（配信履歴の空状態）
    └── EmptyBattleStats.tsx     ← Server（バトル戦績の空状態）
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
      {/** 背景装飾: 左上のパープル blur オーブ */}
      <div
        aria-hidden
        className="pointer-events-none fixed -left-32 -top-32 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(203,172,249,0.08) 0%, transparent 70%)",
          filter: "blur(120px)",
        }}
      />

      <ProfileHeaderCard isMyProfile={profile.is_self} profile={profile} />

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

カバーグラデ + アバター + 名前 + bio + アクションボタン。

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
      {/** カバーグラデーション */}
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
            {/** Phase 5（social）まで実数なし。表示は仮値 */}
            <span><span className="font-semibold text-white">0</span> フォロワー</span>
            <span><span className="font-semibold text-white">0</span> フォロー中</span>
          </div>

          {isMyProfile ? (
            <Link
              className="rounded-lg border border-dark-border bg-dark-base px-4 py-2 text-sm text-white transition hover:bg-white/[0.03]"
              href="/profile/edit"
            >
              プロフィール編集
            </Link>
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

フォロー / 解除動作は Phase 5 で配線するため `disabled` の見た目だけ。

### `_components/EmptyStreamHistory.tsx`（Server）

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
```

### `_components/EmptyBattleStats.tsx`（Server）

```typescript
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

### サイドバーからの遷移確認

Phase 2 step3 で `/profile/me` へのリンクが Sidebar に既に含まれている。`/profile/me` → `/profile/{id}` のリダイレクト挙動を確認すること。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 自分のプロフィール

1. ログイン後 `/profile/me` にアクセス
2. `/profile/{自分のid}` にリダイレクト
3. ヘッダー右に「プロフィール編集」ボタンが表示される
4. 配信履歴・戦績は空状態 UI が表示される

### シナリオ 2: 他人のプロフィール

1. `/profile/2`（自分以外の id）にアクセス
2. `is_self=false` のレスポンスでヘッダー右に「フォロー」ボタン（disabled）
3. プライバシー情報（生年月日・mbti・location）はレスポンス上で null になっているため画面に出ない

### シナリオ 3: 存在しない id

1. `/profile/9999999` にアクセス → API が 404 → `notFound()` で Next.js の 404 ページ

### シナリオ 4: 不正な id

1. `/profile/abc` → サーバー側で Number 変換失敗 → `notFound()`

### シナリオ 5: 未ログイン / 未オンボーディング

1. ログアウト状態で `/profile/1` → `/sign-in` にリダイレクト
2. `is_onboarded=false` の状態で `/profile/me` → `/onboarding` にリダイレクト

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

### アクセシビリティ

- アバター image 代替テキスト（背景画像なので alt 不要だが、aria-label で名前を案内する案も）
- `<h1>` がページ内で 1 つだけ（プロフィール名）
- 「プロフィール編集」/「フォロー」ボタンはキーボードで到達可能

## 既知の未対応 / 後続 step に持ち越し

- フォロー / フォロー解除動作と数値表示は Phase 5（social）で配線。本 step では 0 固定 + disabled
- 配信履歴・バトル戦績は Phase 6 / Phase 7 で実 API 接続。空状態 UI は残しつつデータ取得部分だけ後で差し替え
- アバター画像表示で 404 になった場合のフォールバックは将来対応（現状はイニシャル文字を表示）
