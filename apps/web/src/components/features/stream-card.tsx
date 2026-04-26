import Link from "next/link"

import LiveBadge from "@/components/ui/live-badge"
import type { MockStream } from "@/libs/mock-data"

type StreamCardProps = {
  stream: MockStream
}

export default function StreamCard({ stream }: StreamCardProps) {
  return (
    <Link
      className="glass-card group flex min-w-[280px] flex-col overflow-hidden rounded-2xl transition-all duration-300 hover:shadow-[0_8px_30px_rgba(203,172,249,0.08)] hover:translate-y-[-2px]"
      href={`/stream/${stream.hostName}`}
    >
      {/* サムネイル */}
      <div className={`relative aspect-video bg-gradient-to-br ${stream.thumbnailColor}`}>
        <div className="absolute inset-0 flex items-center justify-center text-5xl opacity-20">
          {stream.hostAvatar}
        </div>
        {/* オーバーレイグラデーション */}
        <div className="absolute inset-0 bg-gradient-to-t from-dark-base/60 to-transparent" />
        {stream.isLive && (
          <div className="absolute left-3 top-3">
            <LiveBadge />
          </div>
        )}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 rounded-md bg-dark-base/60 px-2 py-1 text-[11px] font-medium text-text-secondary backdrop-blur-sm">
          👁 {stream.viewers.toLocaleString()}
        </div>
      </div>

      {/* 情報 */}
      <div className="flex gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-cyan/20 text-lg">
          {stream.hostAvatar}
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-text-primary transition-colors group-hover:text-primary">
            {stream.title}
          </h3>
          <p className="mt-0.5 text-xs text-text-muted">{stream.hostName}</p>
        </div>
      </div>
    </Link>
  )
}
