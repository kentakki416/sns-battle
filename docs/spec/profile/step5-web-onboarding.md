# step5-web-onboarding.md

`/onboarding` ページを実装する。サインイン直後で `is_onboarded=false` のユーザーが必須プロフィール（表示名 / 生年月日 / 性別）を入力する画面。Server Action から step4 の `PUT /api/users/:id/onboarding` を呼び、完了後 `/` にリダイレクトする。

UI 仕様は `docs/spec/profile/README.md` の [オンボーディング（/onboarding）](./README.md#オンボーディングonboarding) を参照。

依存: step4（onboarding API）。AppShell（Phase 2 step1）で `/onboarding` を **default モード** として扱う前提（Navbar / Sidebar が表示される）が、UX 上 immersive にしたい場合は AppShell 側の `IMMERSIVE_PATH_PREFIXES` に `/onboarding` を追加する案もある。**この step では default モードのまま**で進める。

## 対応内容

### ルーティング: 未オンボーディング時の自動誘導

middleware で誘導する案もあるが、**Server Component で `getCurrentUser()` を呼んだ時点でリダイレクトする** のが Phase 1 の流儀に近い。

`apps/web/src/app/page.tsx`（ホーム）/ `/profile/[id]/page.tsx` 等、認証必須ページの先頭で:

```typescript
const me = await getCurrentUser()
if (me && !me.is_onboarded) redirect("/onboarding")
```

を入れる。本 step では `/onboarding/page.tsx` の存在確認のみが対象で、各ページへの誘導コードは step6 / step7 で実装する。

### ファイル構成

```
apps/web/src/app/onboarding/
├── page.tsx              ← Server Component（ログイン必須、is_onboarded=true なら / にリダイレクト）
├── actions.ts            ← Server Action: completeOnboarding
└── _components/
    ├── OnboardingForm.tsx  ← Client（フォーム + バリデーション）
    └── GenderSelect.tsx    ← Client（性別の 3 ボタン）
```

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

import { OnboardingForm } from "./_components/OnboardingForm"

export const metadata = {
  title: "プロフィール設定 | SNS Battle",
}

export default async function OnboardingPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (me.is_onboarded) redirect("/")

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <header className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white">はじめまして！</h1>
          <p className="mt-2 text-sm text-text-muted">
            プロフィールを設定しましょう
          </p>
        </header>

        <OnboardingForm
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

  if (!name || !birthDate || !gender) {
    return { error: "必須項目を入力してください" }
  }

  const body: CompleteOnboardingRequest = {
    bio: bio.length > 0 ? bio : null,
    birth_date: birthDate,
    gender: gender as CompleteOnboardingRequest["gender"],
    name,
  }

  try {
    await apiClient.put(`/api/users/${userId}/onboarding`, body)
  } catch (e) {
    /** apiClient は !ok で Error を投げる仕様。エラーメッセージを表示用に整形 */
    return { error: "プロフィール登録に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/")
}
```

`apiClient` が status code を取れない簡易実装のため、上記では文言固定。step3 / step4 の API は 400 / 409 を返すので、より精緻に出し分けたい場合は `api-client.ts` に「エラー時に status を持つ Error クラスを throw する」改修を行う（本 step の範囲外、TODO コメント）。

### `OnboardingForm.tsx`（Client）

```typescript
"use client"

import { useActionState } from "react"

import { completeOnboardingAction, type OnboardingActionState } from "../actions"
import { GenderSelect } from "./GenderSelect"

type Props = {
  initialAvatarUrl: string | null
  initialName: string
  userId: number
}

export function OnboardingForm({ initialAvatarUrl, initialName, userId }: Props) {
  const [state, formAction, pending] = useActionState<OnboardingActionState, FormData>(
    completeOnboardingAction.bind(null, userId),
    { error: null },
  )

  return (
    <form action={formAction} className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur">
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

      {state.error && (
        <p className="text-sm text-error">{state.error}</p>
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

### `GenderSelect.tsx`（Client）

ラジオボタンのスタイル付きトグル。

```typescript
"use client"

import { useState } from "react"

const OPTIONS = [
  { label: "男性", value: "MALE" },
  { label: "女性", value: "FEMALE" },
  { label: "その他", value: "OTHER" },
] as const

export function GenderSelect() {
  const [selected, setSelected] = useState<string | null>(null)

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
            type="radio"
            value={opt.value}
            required
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
```

### サインイン後の遷移先を /onboarding に変えるか？

Phase 1 step4 の実装では、サインイン成功時に `is_onboarded=false` なら `/onboarding`、`true` なら `/` に振り分けるロジックが入っている前提。確認が必要なら `apps/web/src/app/api/auth/callback/google/route.ts` を読み、`is_onboarded` 判定が無ければ追加する（**この step の範囲外として TODO コメントで残す**）。

```typescript
/** TODO(step5 連携): callback で is_onboarded=false なら /onboarding に redirect する */
```

実環境では Google サインイン → `/onboarding` 自動誘導 → 完了 → `/` の流れを step5 完了時に実機確認する。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 未オンボーディングユーザーの動線

1. dev DB 上のユーザーを `is_onboarded=false` に書き換え（Prisma Studio）
2. `/sign-in` から該当アカウントでログイン
3. `/onboarding` ページが表示される（または `/` から自動リダイレクト）
4. 表示名・生年月日・性別を入力して「はじめる」
5. `PUT /api/users/:id/onboarding` が呼ばれ、200 が返る
6. `/` にリダイレクト
7. `/onboarding` に直接アクセスすると `/` にリダイレクトされる（既に完了しているため）

### シナリオ 2: バリデーション

1. 必須項目を空のまま送信 → ブラウザ標準の `required` でブロック、または `state.error` が表示される
2. 表示名 31 文字 → ブラウザ側で `maxLength` がブロック、すり抜けても API が 400 を返してエラー表示
3. 18 歳未満の生年月日（例: 今日 - 17 年） → API が 400 を返す → エラー表示

### シナリオ 3: 既にオンボーディング済の場合

1. `is_onboarded=true` の状態で `/onboarding` にアクセス
2. Server Component が `redirect("/")` で即時 `/` に飛ばす

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

### アクセシビリティ

- ラベル/legend が input と紐づいているか
- フォーカストラバース順（表示名 → 自己紹介 → 生年月日 → 性別 3 ボタン → 送信）
- エラー文言が画面読み上げで聞こえるか（`role="alert"` を必要に応じて付ける）

## 既知の未対応 / 後続 step に持ち越し

- アバター画像変更 UI は本 step では出さない（Google 由来のものをそのまま利用）。プロフィール編集（step7）で導入を検討
- API クライアントが status code を返さない簡易実装のため、エラー文言の精緻な出し分けは TODO（`apps/web/src/libs/api-client.ts` の改修）
- middleware による未オンボーディング自動誘導は将来検討（現状は各ページの Server Component で `redirect`）
