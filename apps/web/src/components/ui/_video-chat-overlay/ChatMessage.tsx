"use client"

import type { ChatMessage as ChatMessageType } from "../video-chat-overlay"

import { getUsernameColor } from "./username-color"

type Props = {
  message: ChatMessageType
}

export function ChatMessage({ message }: Props) {
  return (
    <p className="text-sm leading-snug drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
      <span
        className="font-semibold"
        style={{ color: getUsernameColor(message.username) }}
      >
        {message.username}
      </span>
      <span className="ml-2 text-white">{message.message}</span>
    </p>
  )
}
