"use client"

import { useEffect, useRef, useState } from "react"

import type { MockChatMessage } from "@/libs/mock-data"

type VideoChatOverlayProps = {
  messages: MockChatMessage[]
  stampEmojis?: string[]
}

export default function VideoChatOverlay({ messages, stampEmojis }: VideoChatOverlayProps) {
  const [chatInput, setChatInput] = useState("")
  const [showStamps, setShowStamps] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const defaultStamps = ["👍", "🔥", "😂", "👏", "💪", "🎉", "❤️", "⭐", "🏆", "💯", "😮", "🤣"]
  const stamps = stampEmojis ?? defaultStamps

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <div className="absolute bottom-0 left-0 right-0 flex flex-col" style={{ maxHeight: "60%" }}>
      {/* コメント一覧（スクロール可能） */}
      <div
        ref={scrollRef}
        className="flex-1 space-y-1 overflow-y-auto px-4 pb-2 [mask-image:linear-gradient(to_bottom,transparent_0%,black_30%)]"
      >
        {messages.map((msg) => (
          <div key={msg.id} className="flex items-baseline gap-1.5 text-[13px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <span className="shrink-0 font-semibold" style={{ color: msg.color }}>
              {msg.userName}
            </span>
            <span className="text-white/90">{msg.message}</span>
          </div>
        ))}
      </div>

      {/* スタンプパレット */}
      {showStamps && (
        <div className="mx-4 mb-2 rounded-xl p-2.5"
          style={{ background: "rgba(0,3,25,0.7)", backdropFilter: "blur(12px)" }}
        >
          <div className="grid grid-cols-6 gap-1.5">
            {stamps.map((emoji) => (
              <button
                key={emoji}
                className="flex h-9 items-center justify-center rounded-lg text-lg transition-all hover:scale-110 hover:bg-white/[0.1]"
                type="button"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 入力エリア */}
      <div className="flex items-center gap-2 px-4 pb-4 pt-1">
        <button
          className={`shrink-0 rounded-lg px-2.5 py-2 text-sm transition-all ${
            showStamps
              ? "text-primary"
              : "text-white/60 hover:text-white/90"
          }`}
          style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)" }}
          type="button"
          onClick={() => setShowStamps(!showStamps)}
        >
          😀
        </button>
        <div className="flex flex-1 overflow-hidden rounded-xl"
          style={{ background: "rgba(0,3,25,0.5)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <input
            className="flex-1 bg-transparent px-3 py-2 text-sm text-white placeholder-white/40 focus:outline-none"
            placeholder="コメントを送信..."
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
          />
          <button
            className="px-4 text-sm font-semibold text-primary transition-opacity hover:opacity-80"
            type="button"
          >
            送信
          </button>
        </div>
      </div>
    </div>
  )
}
