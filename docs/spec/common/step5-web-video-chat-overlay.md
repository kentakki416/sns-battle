# step5-web-video-chat-overlay.md

`<VideoChatOverlay>` を実装する。配信視聴ページ（`/stream/:username`）とバトルルーム（`/battles/:id`）でビデオの最下部に重ねるチャット UI。コメント一覧 + スタンプパレット + 入力欄の 3 ブロックで構成。

UI 仕様は `docs/spec/common/README.md` の [VideoChatOverlay](./README.md#videochatoverlay-messages-stampemojisappswebsrccomponentsuivideo-chat-overlaytsx) を参照。

実データの送受信は Phase 6（streaming）/ Phase 7（battle）で行う。今 step では **入出力プロップス（messages 配列、onSendMessage、onSendStamp）** を受け取る純粋な表示コンポーネントとして実装する。

## 対応内容

### ファイル構成

```
apps/web/src/components/ui/
├── video-chat-overlay.tsx          ← 親コンポーネント
└── _video-chat-overlay/
    ├── ChatMessageList.tsx         ← Client（コメント一覧 + 自動スクロール）
    ├── ChatMessage.tsx             ← Client（メッセージ 1 件）
    ├── StampPalette.tsx            ← Client（6列グリッド）
    ├── ChatInput.tsx               ← Client（入力欄 + 送信ボタン + スタンプトグル）
    └── username-color.ts           ← ユーザー名から HSL 色を生成（純粋関数）
```

### `_video-chat-overlay/username-color.ts`

ユーザー名から決定論的に HSL 色を生成。ハッシュベースで毎回同じ色を返す。

```typescript
/**
 * ユーザー名から HSL カラー文字列を生成する。
 * 同じ名前は常に同じ色になる。彩度・輝度は固定し、視認性のため明るめに調整。
 */
export const getUsernameColor = (username: string): string => {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 75%)`
}
```

### `video-chat-overlay.tsx`

```typescript
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
  "👍", "🔥", "😂", "👏", "💪", "🎉",
  "❤️", "⭐", "🏆", "💯", "😮", "🤣",
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
      {showStamps && (
        <StampPalette emojis={stampEmojis} onSelect={handleStamp} />
      )}
      <ChatInput
        onSendMessage={onSendMessage}
        onToggleStamps={() => setShowStamps((prev) => !prev)}
        showStamps={showStamps}
      />
    </div>
  )
}
```

### `_video-chat-overlay/ChatMessageList.tsx`

```typescript
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
        maskImage:
          "linear-gradient(to bottom, transparent 0%, black 30%)",
        WebkitMaskImage:
          "linear-gradient(to bottom, transparent 0%, black 30%)",
      }}
    >
      {messages.map((m) => (
        <ChatMessage key={m.id} message={m} />
      ))}
    </div>
  )
}
```

### `_video-chat-overlay/ChatMessage.tsx`

```typescript
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
```

### `_video-chat-overlay/StampPalette.tsx`

```typescript
"use client"

type Props = {
  emojis: ReadonlyArray<string>
  onSelect: (emoji: string) => void
}

export function StampPalette({ emojis, onSelect }: Props) {
  return (
    <div
      className="grid grid-cols-6 gap-2 px-4 py-3"
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,3,25,0.7)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {emojis.map((emoji) => (
        <button
          aria-label={`スタンプ ${emoji}`}
          className="flex h-11 items-center justify-center rounded-lg text-2xl transition hover:scale-110 hover:bg-white/[0.08]"
          key={emoji}
          onClick={() => onSelect(emoji)}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
```

### `_video-chat-overlay/ChatInput.tsx`

```typescript
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
```

### バレルエクスポート

`apps/web/src/components/ui/index.ts` に追記。

```typescript
export { LiveBadge } from "./live-badge"
export { VideoChatOverlay } from "./video-chat-overlay"
export type { ChatMessage } from "./video-chat-overlay"
```

## 動作確認

### プレビューページ

`apps/web/src/app/dev/video-chat-overlay/page.tsx` を一時的に作って動作確認する。完了後に削除。

```typescript
"use client"

import { useState } from "react"

import type { ChatMessage } from "@/components/ui/video-chat-overlay"
import { VideoChatOverlay } from "@/components/ui/video-chat-overlay"

const SEED: ChatMessage[] = [
  { id: "1", message: "こんにちは〜！", username: "alice" },
  { id: "2", message: "はじめての配信", username: "bob" },
  { id: "3", message: "🔥🔥🔥", username: "charlie" },
]

export default function VideoChatOverlayPreviewPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(SEED)

  const handleSendMessage = (message: string) => {
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), message, username: "me" },
    ])
  }

  const handleSendStamp = (emoji: string) => {
    setMessages((prev) => [
      ...prev,
      { id: String(Date.now()), message: emoji, username: "me" },
    ])
  }

  return (
    <main className="relative min-h-screen bg-black">
      {/* ビデオプレースホルダー */}
      <div className="absolute inset-0 flex items-center justify-center text-white/20">
        VIDEO PLACEHOLDER
      </div>
      <VideoChatOverlay
        messages={messages}
        onSendMessage={handleSendMessage}
        onSendStamp={handleSendStamp}
      />
    </main>
  )
}
```

### 動作確認項目

`pnpm dev` 後 `http://localhost:3000/dev/video-chat-overlay` で:

1. 画面下部にコメント 3 件が表示される。各ユーザー名は色違い、メッセージは白
2. 上部はマスクで透過フェードしている（古いメッセージが薄れる）
3. 入力欄に文字を入力 → Enter or 送信ボタンクリック → リストに追加 + 自動スクロール
4. 😀 ボタンクリック → スタンプパレット 6×2 グリッド表示。😀 がパープルにハイライト
5. パレットから絵文字選択 → 自分の発言として追加 + パレット閉じる
6. 送信ボタンは入力空のとき disabled（透過 40%）
7. パレット内の絵文字にホバーで背景がうっすら + 拡大

### `/battles/:id` immersive モードでの確認

`/battles/123` にアクセス（404 になっても OK）し、AppShell が immersive モードを返す。VideoChatOverlay は `position: absolute` で配置されているため親要素が `position: relative` 必須。

### Lint

```bash
cd apps/web && pnpm lint
```

### 確認後のクリーンアップ

`apps/web/src/app/dev/video-chat-overlay/` ディレクトリを削除。

### 既知の未対応

- メッセージの送信は `onSendMessage` プロップスに委譲。実通信は Phase 6 / Phase 7 で
- 画像スタンプ（`stamp_masters` の `image_url`）は今 step では絵文字フォールバックのみ。Phase 9（課金）で対応
- メッセージの絵文字 + 文字長制限、不適切ワードフィルタは未実装（将来）
