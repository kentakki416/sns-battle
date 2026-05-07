"use client"

import { useEffect, useRef } from "react"

import type { ChatMessage as ChatMessageType } from "../video-chat-overlay"

import { ChatMessage } from "./ChatMessage"

type Props = {
  messages: ReadonlyArray<ChatMessageType>
}

export function ChatMessageList({ messages }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight
    }
  }, [messages])

  return (
    <div
      className="flex max-h-72 flex-col gap-1 overflow-y-auto px-4 py-3"
      ref={ref}
      style={{
        maskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
        WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 30%)",
      }}
    >
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </div>
  )
}
