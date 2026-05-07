# step7-web-onboarding.md

`/onboarding` ページを実装する。サインイン直後で `is_onboarded=false` のユーザーが**必須項目（表示名 / 生年月日 / 性別）+ 任意項目（自己紹介 / MBTI / 居住地域 / 趣味）** を入力する画面。Server Action から step4 の `PUT /api/users/:id/onboarding` を呼び、完了後 `/` にリダイレクトする。

UI 仕様は `docs/spec/profile/README.md` の [オンボーディング（/onboarding）](./README.md#オンボーディングonboarding) を参照。

依存: step4（onboarding API）、step5（hobbies マスター API）。AppShell（Phase 2 step1）で `/onboarding` を **default モード** として扱う前提。UX 向上のため将来 immersive モードに切り替える案もあり（本 step では default のまま）。

## ステップ構成

1 画面に全項目をスクロール表示する**シングルステップ形式**を採用（マルチステップウィザードよりも離脱率を下げる）。任意項目は「あとで設定」可で送信ボタンで一気に送る。

```
┌─────────────────────────────────────────┐
│   はじめまして！                          │
│   プロフィールを設定しましょう              │
│                                         │
│   [Avatar Preview]                       │
│                                         │
│   表示名 *      [____________]            │
│   自己紹介      [__________________]      │
│   生年月日 *    [____/____/____]          │
│   性別 *        [男性] [女性] [その他]    │
│                                         │
│   ─ 任意項目（あとで設定可能） ─           │
│                                         │
│   MBTI         [選択しない ▼]            │
│   居住地域     [____________]            │
│   趣味         [□音楽 □ゲーム □映画 ...] │
│                                         │
│   [はじめる]                              │
└─────────────────────────────────────────┘
```

## 対応内容

### ファイル構成

```
apps/web/src/app/onboarding/
├── page.tsx                  ← Server Component（is_onboarded チェック + マスター取得）
├── actions.ts                ← Server Action: completeOnboarding
└── _components/
    ├── OnboardingForm.tsx    ← Client（フォーム + バリデーション）
    └── HobbyChips.tsx        ← Client（趣味の複数選択 chip 群）
```

`GenderSelect` は step5 で onboarding 配下に作成、step9 で `apps/web/src/components/forms/` に切り出す。
`MbtiSelect` も同様の流れ（step9 で共通化）。

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getHobbiesResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { OnboardingForm } from "./_components/OnboardingForm"

export const metadata = {
  title: "プロフィール設定 | SNS Battle",
}

export default async function OnboardingPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (me.is_onboarded) redirect("/")

  /** 趣味マスターを Server Component で取得（同一リクエスト内キャッシュ済み） */
  const hobbiesJson = await apiClient.get<unknown>("/api/hobbies")
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <main className="flex min-h-screen items-start justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">はじめまして！</h1>
          <p className="mt-2 text-sm text-text-muted">
            プロフィールを設定しましょう
          </p>
        </header>

        <OnboardingForm
          hobbies={hobbies}
          initialAvatarUrl={me.avatar_url}
          initialName={me.name ?? ""}
          userId={me.id}
        />
      </div>
    </main>
  )
}
```

### `actions.ts`（Server Action）

```typescript
"use server"

import { redirect } from "next/navigation"

import type { CompleteOnboardingRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type OnboardingActionState = {
  error: string | null
}

export const completeOnboardingAction = async (
  userId: number,
  _prevState: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> => {
  const name = formData.get("name")?.toString().trim() ?? ""
  const bio = formData.get("bio")?.toString().trim() ?? ""
  const birthDate = formData.get("birth_date")?.toString() ?? ""
  const gender = formData.get("gender")?.toString() ?? ""
  const mbti = formData.get("mbti")?.toString() ?? ""
  const location = formData.get("location")?.toString().trim() ?? ""
  const hobbyIds = formData.getAll("hobby_ids").map((v) => Number(v.toString()))

  if (!name || !birthDate || !gender) {
    return { error: "必須項目を入力してください" }
  }

  const body: CompleteOnboardingRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as CompleteOnboardingRequest["gender"],
    hobby_ids: hobbyIds.length > 0 ? hobbyIds : undefined,
    location: location.length > 0 ? location : null,
    mbti: mbti.length > 0 ? (mbti as CompleteOnboardingRequest["mbti"]) : null,
    name,
  }

  try {
    await apiClient.put(`/api/users/${userId}/onboarding`, body)
  } catch {
    return { error: "プロフィール登録に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/")
}
```

### `OnboardingForm.tsx`（Client）

```typescript
"use client"

import { useActionState } from "react"

import type { HobbyMaster } from "@repo/api-schema"

import { completeOnboardingAction, type OnboardingActionState } from "../actions"
import { GenderSelect } from "./GenderSelect"
import { HobbyChips } from "./HobbyChips"
import { MbtiSelect } from "./MbtiSelect"

type Props = {
  hobbies: HobbyMaster[]
  initialAvatarUrl: string | null
  initialName: string
  userId: number
}

export function OnboardingForm({ hobbies, initialAvatarUrl, initialName, userId }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingActionState, FormData>(
    completeOnboardingAction.bind(null, userId),
    { error: null },
  )

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      {/** Avatar プレビュー */}
      <div className="flex justify-center">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{
            backgroundImage: initialAvatarUrl ? `url(${initialAvatarUrl})` : undefined,
            backgroundPosition: "center",
            backgroundSize: "cover",
            background: initialAvatarUrl
              ? undefined
              : "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
          }}
        >
          {!initialAvatarUrl && (initialName.charAt(0) || "?")}
        </span>
      </div>

      {/** ─ 必須項目 ─ */}
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">表示名 *</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          defaultValue={initialName}
          maxLength={30}
          minLength={1}
          name="name"
          required
          type="text"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">自己紹介</span>
        <textarea
          className="min-h-20 rounded-lg border border-dark-border bg-dark-base px-3 py-2 text-sm text-white focus:border-primary-border focus:outline-none"
          maxLength={500}
          name="bio"
          rows={3}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">生年月日 *</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          name="birth_date"
          required
          type="date"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">性別 *</legend>
        <GenderSelect />
      </fieldset>

      {/** ─ 任意項目セクション ─ */}
      <div className="my-1 border-t border-dark-border pt-4">
        <p className="mb-3 text-xs text-text-muted">
          以下は任意項目です（あとで「プロフィール編集」から設定可能）
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">MBTI</legend>
        <MbtiSelect />
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">居住地域</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          maxLength={100}
          name="location"
          placeholder="東京都"
          type="text"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">趣味（複数選択可）</legend>
        <HobbyChips hobbies={hobbies} />
      </fieldset>

      {state.error && (
        <p className="text-sm text-error" role="alert">{state.error}</p>
      )}

      <button
        className="h-11 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
        disabled={pending}
        style={{
          background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
          boxShadow: "0 0 20px rgba(203,172,249,0.3)",
        }}
        type="submit"
      >
        {pending ? "保存中..." : "はじめる"}
      </button>
    </form>
  )
}
```

### `_components/HobbyChips.tsx`（Client）

複数選択の chip 群。`name="hobby_ids"` で複数の hidden input が送られる仕組み（または checkbox の name 共有）。

```typescript
"use client"

import { useState } from "react"

import type { HobbyMaster } from "@repo/api-schema"

type Props = {
  defaultSelectedIds?: number[]
  hobbies: HobbyMaster[]
}

export function HobbyChips({ defaultSelectedIds = [], hobbies }: Props) {
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultSelectedIds))

  const toggle = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {hobbies.map((hobby) => {
        const isSelected = selected.has(hobby.id)
        return (
          <label
            className={[
              "cursor-pointer rounded-full border px-3 py-1.5 text-xs transition",
              isSelected
                ? "border-primary-border bg-primary-glow text-primary"
                : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
            ].join(" ")}
            key={hobby.id}
          >
            <input
              checked={isSelected}
              className="sr-only"
              name="hobby_ids"
              onChange={() => toggle(hobby.id)}
              type="checkbox"
              value={hobby.id}
            />
            {hobby.name}
          </label>
        )
      })}
    </div>
  )
}
```

### `_components/MbtiSelect.tsx`（Client）

16 タイプのプルダウン + 「選択しない」オプション。

```typescript
"use client"

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const

type Props = {
  defaultValue?: string
}

export function MbtiSelect({ defaultValue }: Props) {
  return (
    <select
      className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
      defaultValue={defaultValue ?? ""}
      name="mbti"
    >
      <option value="">選択しない</option>
      {MBTI_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
}
```

### `_components/GenderSelect.tsx`（Client）

step3-edit との共通化は step9 で行う。今 step では onboarding 配下に置く。

（仕様は元の step5 と同じなので省略）

### サインイン後の動線

Phase 1 step4 の callback ハンドラで `is_onboarded=false` 時に `/onboarding` に redirect する処理を確認。未対応なら追加（**この step の範囲外として TODO**）。

```typescript
/** TODO: callback で is_onboarded=false なら /onboarding に redirect */
```

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 必須項目のみで完了

1. `/sign-in` から新規ログイン
2. `/onboarding` ページが表示される
3. 表示名 / 生年月日 / 性別のみ入力 → 「はじめる」
4. 200 → `/` にリダイレクト
5. プロフィールページで MBTI / 居住地域 / 趣味は未設定状態

### シナリオ 2: 全項目で完了

1. 上記 + MBTI を選択 + 居住地域入力 + 趣味を 3 つ選択 → 「はじめる」
2. 200 → `/` にリダイレクト
3. `/profile/me` で全フィールド表示確認

### シナリオ 3: バリデーション

1. 必須項目を空 → ブラウザの `required` でブロック
2. 表示名 31 文字 → `maxLength` でブロック、すり抜けても API が 400
3. 18 歳未満の生年月日 → API が 400 → エラー文言表示

### シナリオ 4: 既にオンボーディング済

1. `is_onboarded=true` で `/onboarding` → `/` にリダイレクト

### シナリオ 5: 趣味が 0 件のマスター

1. dev DB の hobby_masters を全削除（or `is_active=false` に）
2. `/onboarding` → 趣味セクションが空表示（チップス無し）
3. 必須項目だけ入力で送信できる

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

### アクセシビリティ

- ラベル / legend が input と紐づく
- フォーカスを `Tab` で各項目巡回可能
- エラー文言 `role="alert"` 付与済
- 任意項目セクションの説明文は `<p>` で明記

## 既知の未対応 / 後続 step に持ち越し

- アバター画像変更 UI は本 step では出さない（Google 由来のものを利用）
- API クライアントが status code を返さない簡易実装のため、エラー文言の精緻な出し分けは TODO（`apps/web/src/libs/api-client.ts` 改修）
- `GenderSelect` / `MbtiSelect` の共通化は step9 で実施
- middleware による未オンボーディング自動誘導は将来検討
