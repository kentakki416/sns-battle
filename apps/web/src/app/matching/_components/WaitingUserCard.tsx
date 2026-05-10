"use client"

import { motion } from "framer-motion"

/**
 * ロビー画面で「待機中ユーザー」を 1 枠分表示するカード。
 *
 * 型は将来 `GET /api/matching/queue` のレスポンス（待機ユーザー一覧）と整合する想定。
 * 本 step では一覧取得 API を作らないため、props 型のみ先行で定義しておく。
 */
export type WaitingUser = {
    id: number
    age: number | null
    avatarUrl: string | null
    gender: "MALE" | "FEMALE" | "OTHER" | null
    name: string | null
}

type Props = {
    index: number
    user: WaitingUser
}

const formatGender = (gender: WaitingUser["gender"]): string => {
  switch (gender) {
  case "MALE":
    return "男性"
  case "FEMALE":
    return "女性"
  case "OTHER":
    return "その他"
  default:
    return ""
  }
}

export function WaitingUserCard({ index, user }: Props) {
  const meta = [user.age !== null ? `${user.age}歳` : null, formatGender(user.gender)]
    .filter(Boolean)
    .join(" / ")

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 rounded-xl border border-dark-border bg-dark-elevated px-4 py-3"
      initial={{ opacity: 0, y: 8 }}
      transition={{ delay: 0.4 + index * 0.05, duration: 0.35 }}
    >
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-full bg-dark-surface ring-2 ring-primary/20">
        {user.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            alt={user.name ?? "user"}
            className="h-full w-full object-cover"
            src={user.avatarUrl}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg text-text-muted">
            👤
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-white">{user.name ?? "Unknown"}</p>
        {meta && <p className="text-xs text-text-muted">{meta}</p>}
      </div>
      <span
        aria-label="待機中"
        className="h-2 w-2 shrink-0 rounded-full bg-success shadow-[0_0_8px_var(--color-success-glow)]"
      />
    </motion.div>
  )
}
