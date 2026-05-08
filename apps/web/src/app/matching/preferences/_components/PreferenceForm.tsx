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
    { error: null }
  )

  return (
    <form
      action={formAction}
      className="flex flex-col gap-6 rounded-2xl border border-dark-border bg-dark-surface/60 p-6 backdrop-blur"
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-white">性別</legend>
        <p className="text-xs text-text-muted">複数選択可。未選択 = 制限なし</p>
        <GenderMultiSelect defaultValues={preference.preferred_genders} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-white">年齢範囲</legend>
        <p className="text-xs text-text-muted">空欄 = 制限なし（18〜120 歳）</p>
        <AgeRangeInput defaultMax={preference.age_max} defaultMin={preference.age_min} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-white">居住地域</legend>
        <p className="text-xs text-text-muted">複数指定可。Enter で追加（最大 20 件）</p>
        <LocationsInput defaultValues={preference.preferred_locations} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-white">MBTI</legend>
        <p className="text-xs text-text-muted">複数選択可。未選択 = 制限なし</p>
        <MbtiMultiSelect defaultValues={preference.preferred_mbti} />
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold text-white">趣味</legend>
        <p className="text-xs text-text-muted">複数選択可。未選択 = 制限なし</p>
        <HobbyChips
          defaultSelectedIds={preference.preferred_hobby_ids}
          hobbies={hobbies}
          name="preferred_hobby_ids"
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
