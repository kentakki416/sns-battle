"use client"

import { useState } from "react"

import { ChatInput } from "./_video-chat-overlay/ChatInput"
import { ChatMessageList } from "./_video-chat-overlay/ChatMessageList"
import { StampPalette } from "./_video-chat-overlay/StampPalette"

export type ChatMessage = {
  id: string
  message: string
  username: string
}

const DEFAULT_STAMP_EMOJIS: ReadonlyArray<string> = [
  "👍",
  "🔥",
  "😂",
  "👏",
  "💪",
  "🎉",
  "❤️",
  "⭐",
  "🏆",
  "💯",
  "😮",
  "🤣",
]

type Props = {
  messages: ReadonlyArray<ChatMessage>
  onSendMessage: (message: string) => void
  onSendStamp: (emoji: string) => void
  stampEmojis?: ReadonlyArray<string>
}

export function VideoChatOverlay({
  messages,
  onSendMessage,
  onSendStamp,
  stampEmojis = DEFAULT_STAMP_EMOJIS,
}: Props) {
  const [showStamps, setShowStamps] = useState(false)

  const handleStamp = (emoji: string) => {
    onSendStamp(emoji)
    setShowStamps(false)
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 flex max-h-[60%] flex-col">
      <ChatMessageList messages={messages} />
      {showStamps && <StampPalette emojis={stampEmojis} onSelect={handleStamp} />}
      <ChatInput
        onSendMessage={onSendMessage}
        onToggleStamps={() => setShowStamps((prev) => !prev)}
        showStamps={showStamps}
      />
    </div>
  )
}
