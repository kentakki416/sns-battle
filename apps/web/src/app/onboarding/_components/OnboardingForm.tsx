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
    { error: null }
  )

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      <div className="flex justify-center">
        <span
          className="flex h-20 w-20 items-center justify-center rounded-full text-2xl font-bold text-white"
          style={{
            background: initialAvatarUrl
              ? undefined
              : "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
            backgroundImage: initialAvatarUrl ? `url(${initialAvatarUrl})` : undefined,
            backgroundPosition: "center",
            backgroundSize: "cover",
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
        <legend className="mb-1 text-xs text-text-muted">性別 *</legend>
        <GenderSelect />
      </fieldset>

      {/** ─ 任意項目セクション ─ */}
      <div className="my-1 border-t border-dark-border pt-4">
        <p className="mb-3 text-xs text-text-muted">
          以下は任意項目です（あとで「プロフィール編集」から設定可能）
        </p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs text-text-muted">MBTI</legend>
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
        <legend className="mb-1 text-xs text-text-muted">趣味（複数選択可）</legend>
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
