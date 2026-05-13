import Link from "next/link"

import type { SearchUserSummary } from "@repo/api-schema"

type Props = {
  user: SearchUserSummary
}

/**
 * 検索結果やおすすめ一覧で使うユーザーカード。
 * クリックで /profile/:id へ遷移する。フォローボタンは search API が is_following を返すようになった
 * タイミングで追加する想定（現状は未対応のため非表示）。
 */
export function UserCard({ user }: Props) {
  return (
    <Link
      className="glass-card flex items-center gap-4 rounded-2xl p-4 transition hover:-translate-y-0.5"
      href={`/profile/${user.id}`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-primary/40 to-cyan/40 text-base font-bold text-white">
        {user.avatar_url ? (
          /**
           * next/image は外部ホスト許可リスト設定が必要なので一旦 <img> でフォールバック。
           * 検索結果の小さなアイコンなので最適化必須ではない。
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
      </div>
    </Link>
  )
}
