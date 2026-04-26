import Link from "next/link"

import LiveBadge from "@/components/ui/live-badge"
import type { MockUser } from "@/libs/mock-data"

type UserCardProps = {
  user: MockUser
}

export default function UserCard({ user }: UserCardProps) {
  return (
    <Link
      className="glass-card group flex items-center gap-4 rounded-2xl p-4 transition-all duration-300 hover:translate-y-[-2px] hover:shadow-[0_8px_30px_rgba(203,172,249,0.06)]"
      href={`/profile/${user.id}`}
    >
      <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-cyan/10 text-2xl">
        {user.avatar}
        {user.isLive && (
          <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-dark-surface bg-success" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-text-primary group-hover:text-primary">
            {user.name}
          </span>
          {user.isLive && <LiveBadge />}
        </div>
        <p className="truncate text-xs text-text-muted">{user.bio}</p>
        <p className="mt-0.5 text-[11px] text-text-disabled">
          {user.followers.toLocaleString()} フォロワー
        </p>
      </div>

      <button
        className="shrink-0 rounded-lg border border-primary/30 bg-primary-glow px-3.5 py-1.5 text-xs font-semibold text-primary transition-all hover:border-primary/60 hover:bg-primary/20"
        type="button"
        onClick={(e) => e.preventDefault()}
      >
        フォロー
      </button>
    </Link>
  )
}
