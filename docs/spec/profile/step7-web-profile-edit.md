# step7-web-profile-edit.md

`/profile/edit/page.tsx` を実装する。Server Component で自分の現在のプロフィールを step2 API から取得し、フォームを初期値表示。Server Action で step3 の `PUT /api/users/:id` を呼び保存後、`/profile/me` にリダイレクト。

UI 仕様は `docs/spec/profile/README.md` の [プロフィール編集（/profile/edit）](./README.md#プロフィール編集profileedit) を参照。AppShell（Phase 2 step1）の **default モード**で動作する。

依存: step2（GET）、step3（PUT）、step5（オンボーディングフォームと UI を共通化できる箇所は流用）。

## 対応内容

### ファイル構成

```
apps/web/src/app/profile/edit/
├── page.tsx              ← Server Component（自分の現在のプロフィールを取得 → フォームに渡す）
├── actions.ts            ← Server Action: updateProfileAction
└── _components/
    └── ProfileEditForm.tsx  ← Client（フォーム + バリデーション + キャンセル）
```

`GenderSelect` は step5 と同じ動作になるので、`apps/web/src/app/onboarding/_components/GenderSelect.tsx` を **移動して** `apps/web/src/components/forms/GenderSelect.tsx` に切り出し、両ページから import する。

```bash
git mv apps/web/src/app/onboarding/_components/GenderSelect.tsx apps/web/src/components/forms/GenderSelect.tsx
```

step5 の OnboardingForm.tsx の import パスも更新する。

ただし `GenderSelect` は今 step では「初期値を受け取れる」プロパティが必要なので、移動と同時に Props を拡張する:

```typescript
"use client"

import { useState } from "react"

const OPTIONS = [
  { label: "男性", value: "MALE" },
  { label: "女性", value: "FEMALE" },
  { label: "その他", value: "OTHER" },
] as const

type Props = {
  defaultValue?: "MALE" | "FEMALE" | "OTHER"
  required?: boolean
}

export function GenderSelect({ defaultValue, required = true }: Props) {
  const [selected, setSelected] = useState<string | null>(defaultValue ?? null)
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((opt) => (
        <label
          className={[
            "flex h-10 cursor-pointer items-center justify-center rounded-lg border text-sm transition",
            selected === opt.value
              ? "border-primary-border bg-primary-glow text-primary"
              : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
          ].join(" ")}
          key={opt.value}
        >
          <input
            checked={selected === opt.value}
            className="sr-only"
            name="gender"
            onChange={() => setSelected(opt.value)}
            required={required}
            type="radio"
            value={opt.value}
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
```

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getUserResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { ProfileEditForm } from "./_components/ProfileEditForm"

export const metadata = {
  title: "プロフィール編集 | SNS Battle",
}

export default async function ProfileEditPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const json = await apiClient.get<unknown>(`/api/users/${me.id}`)
  const profile = getUserResponseSchema.parse(json)

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">プロフィール編集</h1>
        <p className="mt-1 text-sm text-text-muted">表示名・自己紹介・生年月日・性別を更新できます</p>
      </header>
      <ProfileEditForm profile={profile} userId={me.id} />
    </div>
  )
}
```

### `actions.ts`（Server Action）

```typescript
"use server"

import { redirect } from "next/navigation"

import type { UpdateUserRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type ProfileEditActionState = {
  error: string | null
}

export const updateProfileAction = async (
  userId: number,
  _prevState: ProfileEditActionState,
  formData: FormData,
): Promise<ProfileEditActionState> => {
  const name = formData.get("name")?.toString().trim() ?? ""
  const bio = formData.get("bio")?.toString().trim() ?? ""
  const birthDate = formData.get("birth_date")?.toString() ?? ""
  const gender = formData.get("gender")?.toString() ?? ""

  if (!name || !birthDate || !gender) {
    return { error: "必須項目を入力してください" }
  }

  const body: UpdateUserRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as UpdateUserRequest["gender"],
    name,
  }

  try {
    await apiClient.put(`/api/users/${userId}`, body)
  } catch {
    return { error: "プロフィール更新に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/profile/me")
}
```

### `ProfileEditForm.tsx`（Client）

```typescript
"use client"

import Link from "next/link"
import { useActionState } from "react"

import type { GetUserResponse } from "@repo/api-schema"

import { GenderSelect } from "@/components/forms/GenderSelect"

import { updateProfileAction, type ProfileEditActionState } from "../actions"

type Props = {
  profile: GetUserResponse
  userId: number
}

export function ProfileEditForm({ profile, userId }: Props) {
  const [state, formAction, pending] = useActionState<ProfileEditActionState, FormData>(
    updateProfileAction.bind(null, userId),
    { error: null },
  )

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">表示名 *</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          defaultValue={profile.name ?? ""}
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
          defaultValue={profile.bio ?? ""}
          maxLength={500}
          name="bio"
          rows={3}
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">生年月日 *</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          defaultValue={profile.birth_date ?? ""}
          name="birth_date"
          required
          type="date"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">性別 *</legend>
        <GenderSelect defaultValue={profile.gender ?? undefined} />
      </fieldset>

      {state.error && (
        <p className="text-sm text-error" role="alert">{state.error}</p>
      )}

      <div className="flex items-center gap-3">
        <button
          className="h-11 flex-1 rounded-lg text-sm font-semibold text-white transition disabled:opacity-50"
          disabled={pending}
          style={{
            background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
            boxShadow: "0 0 20px rgba(203,172,249,0.3)",
          }}
          type="submit"
        >
          {pending ? "保存中..." : "保存"}
        </button>
        <Link
          className="h-11 rounded-lg border border-dark-border px-5 text-sm leading-[40px] text-text-muted transition hover:text-white"
          href="/profile/me"
        >
          キャンセル
        </Link>
      </div>
    </form>
  )
}
```

### step6 のヘッダーから動線確認

step6 の `ProfileHeaderCard` の「プロフィール編集」リンクが既に `/profile/edit` を指しているため、step7 完了時に動線が繋がる。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 既存値が初期値として表示される

1. `/profile/me` から「プロフィール編集」をクリック → `/profile/edit`
2. 表示名・自己紹介・生年月日・性別が現在の値で初期表示される

### シナリオ 2: 更新

1. 表示名を変更して「保存」
2. `PUT /api/users/:id` が呼ばれ、200 を受けて `/profile/me` にリダイレクト
3. プロフィール表示の表示名が更新されている

### シナリオ 3: バリデーション

1. 表示名を空にして「保存」 → required で送信ブロック
2. 生年月日を 17 歳以下にして「保存」 → API が 400 → `state.error` に文言表示
3. bio に 501 文字 → `maxLength` で入力ブロック

### シナリオ 4: 認証 / オンボーディング

1. ログアウト状態 → `/sign-in` リダイレクト
2. `is_onboarded=false` → `/onboarding` リダイレクト

### シナリオ 5: キャンセル

1. 入力後「キャンセル」 → `/profile/me` へ遷移、変更は反映されない

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

### アクセシビリティ

- `<label>` と input が紐づいている
- エラー文言に `role="alert"` 付与
- 「保存」ボタンは pending 中 disabled

## Phase 3 完了の最終チェック

step7 まで全てマージされたら以下を行う:

1. `apps/web/src/app/page.tsx` 等のホーム系で `is_onboarded=false` 時の `/onboarding` リダイレクトが入っていることを確認（または step5 のリンク先で完結していること）
2. `docs/spec/todo.md` の Phase 3 チェックボックスを `[x]` に更新
3. `docs/spec/README.md` の共通基盤クイックリファレンスでプロフィール機能を「完了」に変更

## 既知の未対応 / 後続 step に持ち越し

- アバター画像のアップロード機能（S3 Pre-signed URL 等）は将来フェーズ
- `apiClient` の status code 取得改修は別 step / 別 PR で対応する TODO
- `MatchingPreference` の編集 UI（マッチングフィルタ）は将来フェーズ
