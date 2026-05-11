"use client"

import { Track, type Participant } from "livekit-client"
import { useEffect, useRef } from "react"

type Props = {
  isSpotlight: boolean
  label: string
  participant: Participant | null
}

/**
 * ローカル / リモート参加者のビデオを 1 枠表示するパネル。
 *
 * - LiveKit `Track.attach(element)` を `<video>` 要素に貼る
 * - 参加者が居ないときはアバター代わりのプレースホルダ
 * - `isSpotlight=true` で枠を強調（テーマ進行で「話す側」のフォーカス用）
 */
export function VideoPanel({ isSpotlight, label, participant }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null)

  useEffect(() => {
    const video = videoRef.current
    if (!video || !participant) return

    const tracks = participant
      .getTrackPublications()
      .filter((p) => p.kind === Track.Kind.Video && p.track)

    const track = tracks[0]?.track
    if (!track) return

    track.attach(video)
    return () => {
      track.detach(video)
    }
  }, [participant])

  return (
    <div
      className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-dark-elevated transition ${
        isSpotlight ? "ring-2 ring-primary shadow-[0_0_30px_var(--color-primary-glow)]" : ""
      }`}
    >
      <video
        autoPlay
        className="h-full w-full object-cover"
        muted
        playsInline
        ref={videoRef}
      />
      {!participant && (
        <div className="absolute inset-0 flex items-center justify-center text-text-muted">
          <span className="text-5xl">👤</span>
        </div>
      )}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/50 px-2 py-0.5 text-xs text-white">
        {label}
      </span>
    </div>
  )
}
