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
    { error: null }
  )

  const selectedHobbyIds = profile.hobbies.map((h) => h.id)

  return (
    <form
      action={formAction}
      className="flex flex-col gap-5 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      <label className="flex flex-col gap-1.5">
        <span className="text-xs text-text-muted">
          表示名 <span className="text-accent-orange">*</span>
        </span>
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
        <span className="text-xs text-text-muted">
          生年月日 <span className="text-accent-orange">*</span>
        </span>
        <input
          className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
          defaultValue={profile.birth_date ?? ""}
          name="birth_date"
          required
          type="date"
        />
      </label>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs text-text-muted">
          性別 <span className="text-accent-orange">*</span>
        </legend>
        <GenderSelect defaultValue={profile.gender ?? undefined} />
      </fieldset>

      <div className="my-1 border-t border-dark-border pt-4">
        <p className="mb-3 text-xs text-text-muted">以下は任意項目です</p>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1 text-xs text-text-muted">MBTI</legend>
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
        <legend className="mb-1 text-xs text-text-muted">趣味（複数選択可）</legend>
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
