"use client"

import { type Room } from "livekit-client"
import { useState } from "react"

type Props = {
  canEndNow: boolean
  onEnd: () => void
  room: Room | null
}

/**
 * セッション中のボトム操作バー。
 *
 * - ミュート / カメラのトグルは `room.localParticipant.setMicrophoneEnabled` 等を呼ぶだけ
 * - 終了ボタンは `can_end_now=true`（5 分経過）でのみ enable。クリックで `onEnd` を呼ぶ
 *   （上位で endSession + /matching/result 遷移を行う）
 */
export function BottomControls({ canEndNow, onEnd, room }: Props) {
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const toggleMic = () => {
    if (!room) return
    void room.localParticipant.setMicrophoneEnabled(!micOn)
    setMicOn((v) => !v)
  }

  const toggleCam = () => {
    if (!room) return
    void room.localParticipant.setCameraEnabled(!camOn)
    setCamOn((v) => !v)
  }

  return (
    <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-4 bg-gradient-to-t from-black/70 to-transparent px-6 py-4">
      <button
        aria-label={micOn ? "マイクをオフ" : "マイクをオン"}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-elevated text-xl text-white transition hover:bg-dark-surface"
        onClick={toggleMic}
        type="button"
      >
        {micOn ? "🎤" : "🔇"}
      </button>
      <button
        aria-label={camOn ? "カメラをオフ" : "カメラをオン"}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-dark-elevated text-xl text-white transition hover:bg-dark-surface"
        onClick={toggleCam}
        type="button"
      >
        {camOn ? "📷" : "🚫"}
      </button>
      <button
        aria-label="セッション終了"
        className={`flex items-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition ${
          canEndNow
            ? "bg-error text-white hover:bg-error/80"
            : "cursor-not-allowed bg-dark-elevated text-text-disabled"
        }`}
        disabled={!canEndNow}
        onClick={onEnd}
        type="button"
      >
        終了する
      </button>
    </div>
  )
}
