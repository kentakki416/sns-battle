"use client"

import LiveBadge from "@/components/ui/live-badge"
import VideoChatOverlay from "@/components/ui/video-chat-overlay"
import { mockChatMessages, mockStreams } from "@/libs/mock-data"

export default function StreamPage() {
  const stream = mockStreams[0]

  return (
    <div className="relative flex h-screen flex-col">
      {/* ビデオ（フルスクリーン） */}
      <div className={`relative flex-1 bg-gradient-to-br ${stream.thumbnailColor}`}>
        <div className="absolute inset-0 flex items-center justify-center text-[120px] opacity-10">
          {stream.hostAvatar}
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-dark-base/60 via-transparent to-transparent" />

        {/* 上部: 配信情報 */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between p-5">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-xl ring-2 ring-white/20"
              style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
            >
              {stream.hostAvatar}
            </span>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                  {stream.hostName}
                </span>
                <LiveBadge />
              </div>
              <p className="text-xs text-white/70 drop-shadow-[0_1px_3px_rgba(0,0,0,0.6)]">
                👁 {stream.viewers.toLocaleString()} 人視聴中
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              className="rounded-lg bg-gradient-to-r from-primary to-primary-hover px-4 py-1.5 text-xs font-semibold text-dark-base transition-opacity hover:opacity-90"
              type="button"
            >
              フォロー
            </button>
            {["🔇", "⛶"].map((icon) => (
              <button
                key={icon}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-white/80 transition-colors hover:text-white"
                style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
                type="button"
              >
                {icon}
              </button>
            ))}
          </div>
        </div>

        {/* コメントオーバーレイ */}
        <VideoChatOverlay messages={mockChatMessages} />
      </div>
    </div>
  )
}
