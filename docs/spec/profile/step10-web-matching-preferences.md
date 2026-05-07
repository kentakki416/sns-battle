# step10-web-matching-preferences.md

`/matching/preferences/page.tsx` を実装する。マッチング時に使うフィルタ条件（性別 / 年齢範囲 / 居住地域 / MBTI / 趣味）を編集する画面。Server Action で step6 の `PUT /api/matching/preferences` を呼び保存後、`/profile/me` にリダイレクト。

UI 仕様は `docs/spec/profile/README.md` の [マッチングフィルタ設定（/matching/preferences）](./README.md#マッチングフィルタ設定matchingpreferences) を参照。AppShell（Phase 2 step1）の **default モード**で動作する。

依存: step5（hobbies マスター）、step6（matching-preferences API）、step9（共通フォームコンポーネント）。

## ページ構成

```
┌──────────────────────────────────────────────────┐
│   マッチングフィルタ設定                            │
│   このフィルタは Phase 4 のマッチング時に           │
│   相手の絞り込みに使用されます                      │
│                                                  │
│   性別          [□ 男性] [□ 女性] [□ その他]      │
│   年齢範囲      [25] 〜 [40]                      │
│   居住地域      [+ Tokyo] [+ Osaka] [...入力欄]    │
│   MBTI          [□ INTJ] [□ ENTP] ... (16 タイプ) │
│   趣味          [□ 音楽] [□ ゲーム] [□ 映画] ...   │
│                                                  │
│   [保存]  [キャンセル]                            │
└──────────────────────────────────────────────────┘
```

すべて空配列 / null は「制限なし」（全マッチ対象）。

## 対応内容

### ファイル構成

```
apps/web/src/app/matching/preferences/
├── page.tsx              ← Server Component（preference + hobbies 取得）
├── actions.ts            ← Server Action: updatePreferenceAction
└── _components/
    ├── PreferenceForm.tsx     ← Client（フォーム本体）
    ├── GenderMultiSelect.tsx  ← Client（複数選択 chip）
    ├── MbtiMultiSelect.tsx    ← Client（16 タイプ chip）
    ├── LocationsInput.tsx     ← Client（自由入力タグ群）
    └── AgeRangeInput.tsx      ← Client（min / max 数値入力）
```

`HobbyChips`（step9 で `apps/web/src/components/forms/HobbyChips.tsx` に切り出し済）を再利用する。

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import {
  getHobbiesResponseSchema,
  getMatchingPreferenceResponseSchema,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { PreferenceForm } from "./_components/PreferenceForm"

export const metadata = {
  title: "マッチングフィルタ | SNS Battle",
}

export default async function MatchingPreferencesPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const [preferenceJson, hobbiesJson] = await Promise.all([
    apiClient.get<unknown>("/api/matching/preferences"),
    apiClient.get<unknown>("/api/hobbies"),
  ])
  const preference = getMatchingPreferenceResponseSchema.parse(preferenceJson)
  const { hobbies } = getHobbiesResponseSchema.parse(hobbiesJson)

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">マッチングフィルタ設定</h1>
        <p className="mt-1 text-sm text-text-muted">
          条件に当てはまるユーザーのみマッチング候補に出ます。すべて空欄のままなら制限なし
        </p>
      </header>

      <PreferenceForm hobbies={hobbies} preference={preference} />
    </div>
  )
}
```

### `actions.ts`（Server Action）

```typescript
"use server"

import { redirect } from "next/navigation"

import type { UpdateMatchingPreferenceRequest } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

export type PreferenceActionState = {
  error: string | null
}

const parseInt = (raw: string | undefined): number | null => {
  if (!raw) return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  const n = Number(trimmed)
  if (!Number.isInteger(n)) return null
  return n
}

export const updatePreferenceAction = async (
  _prevState: PreferenceActionState,
  formData: FormData,
): Promise<PreferenceActionState> => {
  const ageMin = parseInt(formData.get("age_min")?.toString())
  const ageMax = parseInt(formData.get("age_max")?.toString())
  const preferredGenders = formData.getAll("preferred_genders").map((v) => v.toString())
  const preferredLocations = formData
    .getAll("preferred_locations")
    .map((v) => v.toString().trim())
    .filter((v) => v.length > 0)
  const preferredMbti = formData.getAll("preferred_mbti").map((v) => v.toString())
  const preferredHobbyIds = formData
    .getAll("preferred_hobby_ids")
    .map((v) => Number(v.toString()))

  if (ageMin !== null && ageMax !== null && ageMin > ageMax) {
    return { error: "最小年齢は最大年齢以下にしてください" }
  }

  const body: UpdateMatchingPreferenceRequest = {
    age_max: ageMax,
    age_min: ageMin,
    preferred_genders: preferredGenders as UpdateMatchingPreferenceRequest["preferred_genders"],
    preferred_hobby_ids: preferredHobbyIds,
    preferred_locations: preferredLocations,
    preferred_mbti: preferredMbti as UpdateMatchingPreferenceRequest["preferred_mbti"],
  }

  try {
    await apiClient.put("/api/matching/preferences", body)
  } catch {
    return { error: "フィルタ設定の保存に失敗しました。入力内容をご確認ください。" }
  }

  redirect("/profile/me")
}
```

### `PreferenceForm.tsx`（Client）

```typescript
"use client"

import Link from "next/link"
import { useActionState } from "react"

import type { GetMatchingPreferenceResponse, HobbyMaster } from "@repo/api-schema"

import { HobbyChips } from "@/components/forms/HobbyChips"

import { updatePreferenceAction, type PreferenceActionState } from "../actions"
import { AgeRangeInput } from "./AgeRangeInput"
import { GenderMultiSelect } from "./GenderMultiSelect"
import { LocationsInput } from "./LocationsInput"
import { MbtiMultiSelect } from "./MbtiMultiSelect"

type Props = {
  hobbies: HobbyMaster[]
  preference: GetMatchingPreferenceResponse
}

export function PreferenceForm({ hobbies, preference }: Props) {
  const [state, formAction, pending] = useActionState<PreferenceActionState, FormData>(
    updatePreferenceAction,
    { error: null },
  )

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-widest text-text-disabled">性別</legend>
        <p className="text-xs text-text-muted">複数選択可。未選択 = 制限なし</p>
        <GenderMultiSelect defaultValues={preference.preferred_genders} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-widest text-text-disabled">年齢範囲</legend>
        <p className="text-xs text-text-muted">空欄 = 制限なし</p>
        <AgeRangeInput defaultMax={preference.age_max} defaultMin={preference.age_min} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-widest text-text-disabled">居住地域</legend>
        <p className="text-xs text-text-muted">複数指定可。Enter で追加</p>
        <LocationsInput defaultValues={preference.preferred_locations} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-widest text-text-disabled">MBTI</legend>
        <p className="text-xs text-text-muted">複数選択可</p>
        <MbtiMultiSelect defaultValues={preference.preferred_mbti} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-xs uppercase tracking-widest text-text-disabled">趣味</legend>
        <p className="text-xs text-text-muted">複数選択可</p>
        <HobbyChips
          defaultSelectedIds={preference.preferred_hobby_ids}
          hobbies={hobbies}
        />
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

`HobbyChips` の `name` 属性は `"preferred_hobby_ids"` に変える必要がある。step9 で切り出した `HobbyChips` には `name` を任意の文字列で渡せるように Props を追加する:

```typescript
type Props = {
  defaultSelectedIds?: number[]
  hobbies: HobbyMaster[]
  /** form 送信時の name 属性。デフォルト "hobby_ids" */
  name?: string
}
```

step7 / step9 では `name` 未指定で `"hobby_ids"`、step10 では `name="preferred_hobby_ids"` を渡す。

### `_components/GenderMultiSelect.tsx`（Client）

```typescript
"use client"

import { useState } from "react"

const OPTIONS = [
  { label: "男性", value: "MALE" },
  { label: "女性", value: "FEMALE" },
  { label: "その他", value: "OTHER" },
] as const

type Props = {
  defaultValues?: string[]
}

export function GenderMultiSelect({ defaultValues = [] }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues))

  const toggle = (v: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  return (
    <div className="flex gap-2">
      {OPTIONS.map((opt) => (
        <label
          className={[
            "cursor-pointer rounded-lg border px-4 py-2 text-sm transition",
            selected.has(opt.value)
              ? "border-primary-border bg-primary-glow text-primary"
              : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
          ].join(" ")}
          key={opt.value}
        >
          <input
            checked={selected.has(opt.value)}
            className="sr-only"
            name="preferred_genders"
            onChange={() => toggle(opt.value)}
            type="checkbox"
            value={opt.value}
          />
          {opt.label}
        </label>
      ))}
    </div>
  )
}
```

### `_components/MbtiMultiSelect.tsx`（Client）

16 タイプを 4×4 グリッドで chip 表示。

```typescript
"use client"

import { useState } from "react"

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const

type Props = {
  defaultValues?: string[]
}

export function MbtiMultiSelect({ defaultValues = [] }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultValues))

  const toggle = (v: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(v)) next.delete(v)
      else next.add(v)
      return next
    })
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {MBTI_TYPES.map((t) => (
        <label
          className={[
            "cursor-pointer rounded-lg border py-2 text-center text-xs transition",
            selected.has(t)
              ? "border-primary-border bg-primary-glow text-primary"
              : "border-dark-border bg-dark-base text-text-muted hover:bg-white/[0.03]",
          ].join(" ")}
          key={t}
        >
          <input
            checked={selected.has(t)}
            className="sr-only"
            name="preferred_mbti"
            onChange={() => toggle(t)}
            type="checkbox"
            value={t}
          />
          {t}
        </label>
      ))}
    </div>
  )
}
```

### `_components/AgeRangeInput.tsx`（Client）

```typescript
"use client"

type Props = {
  defaultMax: number | null
  defaultMin: number | null
}

export function AgeRangeInput({ defaultMax, defaultMin }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        className="h-10 w-20 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        defaultValue={defaultMin ?? ""}
        max={120}
        min={18}
        name="age_min"
        placeholder="18"
        type="number"
      />
      <span className="text-text-muted">〜</span>
      <input
        className="h-10 w-20 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        defaultValue={defaultMax ?? ""}
        max={120}
        min={18}
        name="age_max"
        placeholder="120"
        type="number"
      />
      <span className="text-xs text-text-muted">歳</span>
    </div>
  )
}
```

### `_components/LocationsInput.tsx`（Client）

タグ追加方式（Enter で確定、x で削除）。

```typescript
"use client"

import { useState, type KeyboardEvent } from "react"

type Props = {
  defaultValues?: string[]
}

export function LocationsInput({ defaultValues = [] }: Props) {
  const [tags, setTags] = useState<string[]>(defaultValues)
  const [draft, setDraft] = useState("")

  const addTag = () => {
    const t = draft.trim()
    if (t.length === 0 || tags.includes(t) || tags.length >= 20) return
    setTags([...tags, t])
    setDraft("")
  }

  const removeTag = (tag: string) => setTags(tags.filter((x) => x !== tag))

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-primary-border bg-primary-glow px-3 py-1 text-xs text-primary"
            key={tag}
          >
            {tag}
            <button
              aria-label={`${tag} を削除`}
              className="text-primary hover:text-white"
              onClick={() => removeTag(tag)}
              type="button"
            >
              ×
            </button>
            {/** form 送信用の hidden input（複数 name で配列送信） */}
            <input name="preferred_locations" type="hidden" value={tag} />
          </span>
        ))}
      </div>
      <input
        className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="例: 東京都（Enter で追加）"
        type="text"
        value={draft}
      />
    </div>
  )
}
```

### サイドバーへの導線

step8 の `ProfileHeaderCard` から「マッチングフィルタ」リンクが既に張られている。Phase 2 step3 の Sidebar に独立メニュー追加は **未対応**（必要なら将来 step）。

## 動作確認

### dev サーバー

```bash
pnpm dev
```

### シナリオ 1: 初回（フィルタ未設定）

1. ログイン後 `/matching/preferences`
2. 全フィールド空（gender / mbti / hobby のチップ全部非選択、location 0 タグ、age_min / age_max 空欄）
3. いくつか選択 → 「保存」 → 200 → `/profile/me`

### シナリオ 2: 既存値の編集

1. 1 度設定したユーザーが再アクセス → 既存値が初期表示
2. 一部解除（chip クリックで非選択） → 保存 → DB 更新

### シナリオ 3: バリデーション

1. age_min=40 / age_max=20 → クライアント側でエラー文言「最小年齢は最大年齢以下にしてください」
2. age_min=15 → input の min=18 でブラウザブロック、すり抜けても API 400
3. location 21 件目 → クライアント側で追加されない（max 20）
4. その他フィールドの組み合わせで API 400 → エラー文言

### シナリオ 4: 全部空

1. 全フィールド未選択で保存 → 200、DB のレコードは全配列空 + age null
2. リロードで全フィールド空のまま表示

### シナリオ 5: 認証 / オンボーディング

1. ログアウト → `/sign-in`
2. `is_onboarded=false` → `/onboarding`

### Lint / Build

```bash
cd apps/web && pnpm lint && pnpm build
```

### アクセシビリティ

- 各 fieldset の legend が読み上げられる
- 削除ボタンに `aria-label`
- エラー文言 `role="alert"`

## Phase 3 完了の最終チェック

step10 まで全てマージされたら以下を行う:

1. `apps/web/src/app/page.tsx` 等のホーム系で `is_onboarded=false` 時の `/onboarding` リダイレクトが入っていることを確認（または step7 のリンク先で完結）
2. `docs/spec/todo.md` の Phase 3 チェックボックスを `[x]` に更新
3. `docs/spec/README.md` のクイックリファレンスでプロフィール機能を「完了」に変更

## 既知の未対応 / 後続 step に持ち越し

- 趣味の重複度に応じた相性スコア表示は Phase 8（MBTI・会話アシスト）で実装
- 居住地域はテキスト自由入力（誤字や同義語あり）。将来は都道府県マスター化を検討
- フィルタ条件を実マッチングロジックで適用するのは Phase 4（matching）
