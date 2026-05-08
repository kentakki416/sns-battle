"use client"

import Link from "next/link"

import type { GetUserResponse } from "@repo/api-schema"

type Props = {
  isMyProfile: boolean
  profile: GetUserResponse
}

/**
 * カバーグラデ + アバター + 名前 + 年齢 + bio + アクションボタン。
 * 自分のときは「プロフィール編集」「マッチングフィルタ」、他人のときは disabled の「フォロー」を表示。
 */
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
              background: profile.avatar_url
                ? undefined
                : "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
              backgroundImage: profile.avatar_url ? `url(${profile.avatar_url})` : undefined,
              backgroundPosition: "center",
              backgroundSize: "cover",
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
              className="rounded-lg px-4 py-2 text-sm font-semibold text-dark-base transition disabled:opacity-70"
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
