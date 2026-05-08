import type { ReactNode } from "react"

import type { GetUserResponse } from "@repo/api-schema"

type Props = {
  profile: GetUserResponse
}

/**
 * MBTI / 居住地域 / 趣味の表示セクション。
 * - 自分のとき: いずれも「未設定」を含めて常に表示（補完導線）
 * - 他人のとき: 全項目が空の場合は section ごと非表示
 */
export function ProfileDetailSection({ profile }: Props) {
  const hasAny = Boolean(profile.mbti) || Boolean(profile.location) || profile.hobbies.length > 0
  if (!hasAny && !profile.is_self) return null

  return (
    <section className="mt-6 space-y-4 rounded-2xl border border-dark-border bg-dark-surface/60 p-5 backdrop-blur">
      <DetailRow label="MBTI" value={profile.mbti ? <Pill text={profile.mbti} /> : <Empty />} />
      <DetailRow
        label="居住地域"
        value={profile.location ? <span>{profile.location}</span> : <Empty />}
      />
      <DetailRow
        label="趣味"
        value={
          profile.hobbies.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {profile.hobbies.map((h) => (
                <Pill key={h.id} text={h.name} />
              ))}
            </div>
          ) : (
            <Empty />
          )
        }
      />
    </section>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:gap-4">
      <span className="w-20 flex-shrink-0 text-xs uppercase tracking-widest text-text-disabled">
        {label}
      </span>
      <div className="flex-1 text-sm text-white">{value}</div>
    </div>
  )
}

function Pill({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-primary-border bg-primary-glow px-3 py-1 text-xs text-primary">
      {text}
    </span>
  )
}

function Empty() {
  return <span className="text-xs text-text-disabled">未設定</span>
}
