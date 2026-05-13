import Link from "next/link"

import type { RecommendedUserSummary } from "@repo/api-schema"

type Props = {
  user: RecommendedUserSummary
}

/**
 * ホームの「おすすめユーザー」セクションで使うカード。
 * 検索用 UserCard と異なり、フォロワー数も表示する。
 * フォローボタンは API（POST /api/users/:id/follow）が用意されているが、
 * Server Component から状態を管理する仕組みが未整備なので別ステップで追加する。
 */
export function RecommendedUserCard({ user }: Props) {
  return (
    <Link
      className="glass-card flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5"
      href={`/profile/${user.id}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/40 to-cyan/40 text-base font-bold text-white">
        {user.avatar_url ? (
          /**
           * next/image は外部ホスト許可リスト設定が必要なので一旦 <img> でフォールバック。
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="h-full w-full object-cover" src={user.avatar_url} />
        ) : (
          <span>{(user.name?.[0] ?? "?").toUpperCase()}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{user.name ?? "(名前未設定)"}</p>
        {user.bio ? (
          <p className="line-clamp-2 text-xs text-text-muted">{user.bio}</p>
        ) : null}
        <p className="mt-1 text-[11px] text-text-disabled">
          {user.follower_count.toLocaleString()} フォロワー
        </p>
      </div>
    </Link>
  )
}
