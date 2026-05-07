"use client"

import { useState, type KeyboardEvent } from "react"

type Props = {
  onSendMessage: (message: string) => void
  onToggleStamps: () => void
  showStamps: boolean
}

export function ChatInput({ onSendMessage, onToggleStamps, showStamps }: Props) {
  const [value, setValue] = useState("")

  const handleSend = () => {
    const trimmed = value.trim()
    if (trimmed.length === 0) return
    onSendMessage(trimmed)
    setValue("")
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <button
        aria-label="スタンプパレット切替"
        className={[
          "flex h-10 w-10 items-center justify-center rounded-lg text-xl transition",
          showStamps
            ? "bg-primary-glow text-primary"
            : "text-text-muted hover:bg-white/[0.05] hover:text-white",
        ].join(" ")}
        onClick={onToggleStamps}
        type="button"
      >
        😀
      </button>
      <input
        className="h-10 flex-1 rounded-lg border border-white/[0.08] px-3 text-sm text-white placeholder:text-text-muted focus:border-primary-border focus:outline-none"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="コメントを送信"
        style={{ backdropFilter: "blur(12px)", background: "rgba(0,3,25,0.5)" }}
        type="text"
        value={value}
      />
      <button
        className="h-10 rounded-lg px-4 text-sm font-semibold text-primary transition hover:bg-primary-glow disabled:opacity-40"
        disabled={value.trim().length === 0}
        onClick={handleSend}
        type="button"
      >
        送信
      </button>
    </div>
  )
}
