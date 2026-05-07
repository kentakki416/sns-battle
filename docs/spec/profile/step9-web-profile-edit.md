# step9-web-profile-edit.md

`/profile/edit/page.tsx` を実装する。Server Component で自分の現在のプロフィールと趣味マスターを取得し、フォームを初期値表示。Server Action で step3 の `PUT /api/users/:id` を呼び保存後、`/profile/me` にリダイレクト。**MBTI / 居住地域 / 趣味の編集も含む**。

UI 仕様は `docs/spec/profile/README.md` の [プロフィール編集（/profile/edit）](./README.md#プロフィール編集profileedit) を参照。AppShell（Phase 2 step1）の **default モード**で動作する。

依存: step2（GET）、step3（PUT）、step5（hobbies マスター）、step7（onboarding と GenderSelect / MbtiSelect / HobbyChips を共通化）。

## GenderSelect / MbtiSelect / HobbyChips の共通化

step7（onboarding）配下に置いた 3 コンポーネントを `apps/web/src/components/forms/` に切り出す。

```bash
git mv apps/web/src/app/onboarding/_components/GenderSelect.tsx apps/web/src/components/forms/GenderSelect.tsx
git mv apps/web/src/app/onboarding/_components/MbtiSelect.tsx apps/web/src/components/forms/MbtiSelect.tsx
git mv apps/web/src/app/onboarding/_components/HobbyChips.tsx apps/web/src/components/forms/HobbyChips.tsx
```

step7 の `OnboardingForm.tsx` の import パスも `@/components/forms/...` に更新する。

各コンポーネントには `defaultValue` / `defaultSelectedIds` プロパティを追加して、編集ページから既存値を渡せるようにする（step7 の HobbyChips はすでに対応、GenderSelect / MbtiSelect も同様の Props 拡張）。

## 対応内容

### ファイル構成

```
apps/web/src/app/profile/edit/
├── page.tsx              ← Server Component（プロフィール + 趣味マスターを取得）
├── actions.ts            ← Server Action: updateProfileAction
└── _components/
    └── ProfileEditForm.tsx  ← Client（フォーム + キャンセル）
```

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getHobbiesResponseSchema, getUserResponseSchema } from "@repo/api-schema"

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

  const [profileJson, hobbiesJson] = await Promise.all([
    apiClient.get<unknown>(`/api/users/${me.id}`),
    apiClient.get<unknown>("/api/hobbies"),
  ])
  const profile = getUserResponseSchema.parse(profileJson)
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">プロフィール編集</h1>
        <p className="mt-1 text-sm text-text-muted">
          表示名・自己紹介・生年月日・性別・MBTI・居住地域・趣味を更新できます
        </p>
      </header>
      <ProfileEditForm hobbies={hobbies} profile={profile} userId={me.id} />
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
  const mbti = formData.get("mbti")?.toString() ?? ""
  const location = formData.get("location")?.toString().trim() ?? ""
  const hobbyIds = formData.getAll("hobby_ids").map((v) => Number(v.toString()))

  if (!name || !birthDate || !gender) {
    return { error: "必須項目を入力してください" }
  }

  const body: UpdateUserRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as UpdateUserRequest["gender"],
    hobby_ids: hobbyIds,
    location: location.length > 0 ? location : null,
    mbti: mbti.length > 0 ? (mbti as UpdateUserRequest["mbti"]) : null,
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

import type { GetUserResponse, HobbyMaster } from "@repo/api-schema"

import { GenderSelect } from "@/components/forms/GenderSelect"
import { HobbyChips } from "@/components/forms/HobbyChips"
import { MbtiSelect } from "@/components/forms/MbtiSelect"

import { updateProfileAction, type ProfileEditActionState } from "../actions"

type Props = {
  hobbies: HobbyMaster[]
  profile: GetUserResponse
  userId: number
}

export function ProfileEditForm({ hobbies, profile, userId }: Props) {
  const [state, formAction, pending] = useActionState<ProfileEditActionState, FormData>(
    updateProfileAction.bind(null, userId),
    { error: null },
  )

  const selectedHobbyIds = profile.hobbies.map((h) => h.id)

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      {/** 必須 */}
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

      {/** 任意セクション */}
      <div className="my-1 border-t border-dark-border pt-4">
        <p className="mb-3 text-xs text-text-muted">以下は任意項目です</p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">MBTI</legend>
        <MbtiSelect defaultValue={profile.mbti ?? undefined} />
      </fieldset>

      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">居住地域</span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          defaultValue={profile.location ?? ""}
          maxLength={100}
          name="location"
          placeholder="東京都"
          type="text"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-xs text-text-muted">趣味（複数選択可）</legend>
        <HobbyChips defaultSelectedIds={selectedHobbyIds} hobbies={hobbies} />
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

### マッチングフィルタへのリンク

step8 の `ProfileHeaderCard` に「マッチングフィルタ」ボタン（`/matching/preferences`）を既に追加済。本ページからもサイドバーやヘッダーから到達可能なので、編集フォームから直接リンクする必要はない。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 既存値の初期表示

1. `/profile/me` → 「プロフィール編集」 → `/profile/edit`
2. 表示名 / 自己紹介 / 生年月日 / 性別 / MBTI / 居住地域 / 趣味（chip にチェック）が現在値で初期表示
3. 趣味は登録済 chip がアクティブカラー

### シナリオ 2: 任意項目の追加

1. オンボーディングで必須のみ設定したユーザー
2. `/profile/edit` で MBTI 選択 + 居住地域入力 + 趣味複数選択
3. 「保存」 → 200 → `/profile/me` にリダイレクト
4. プロフィール表示で全フィールド反映

### シナリオ 3: 任意項目の解除

1. MBTI を「選択しない」に変更 + 居住地域を空に + 趣味全解除
2. 「保存」 → 200 → DB の mbti / location が null、user_hobbies が 0 件

### シナリオ 4: バリデーション

1. 表示名空 → required ブロック
2. 17 歳以下の生年月日 → API 400 → エラー文言
3. bio 501 文字 → maxLength ブロック

### シナリオ 5: 認証 / オンボーディング

1. ログアウト → `/sign-in`
2. `is_onboarded=false` → `/onboarding`

### シナリオ 6: キャンセル

1. 入力後「キャンセル」 → `/profile/me`、変更未反映

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

## 既知の未対応 / 後続 step に持ち越し

- アバター画像のアップロードは将来フェーズ
- API クライアントの status code 取得改修 TODO
- `MatchingPreference` 編集は step10 で `/matching/preferences` ページとして実装
