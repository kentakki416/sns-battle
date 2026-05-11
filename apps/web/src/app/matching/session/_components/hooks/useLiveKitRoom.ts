"use client"

import { Room, RoomEvent, type RemoteParticipant } from "livekit-client"
import { useEffect, useRef, useState } from "react"

import { issueMatchingTokenAction } from "../../actions"

type UseLiveKitRoomInput = {
  enabled: boolean
  sessionId: number | null
}

type UseLiveKitRoomResult = {
  error: string | null
  remoteParticipant: RemoteParticipant | null
  room: Room | null
}

/**
 * LiveKit Room 接続フック。
 *
 * - `enabled=true` かつ `sessionId` がセットされた時点で接続を開始
 * - Server Action で token を発行 → `Room.connect(url, token)` → カメラ + マイク publish
 * - `Room` インスタンスと、相手参加者（`RemoteParticipant`）の参照を返す
 * - unmount で `room.disconnect()` を呼んでクリーンアップ
 *
 * Data Channel の購読は呼び出し側で `room.on(RoomEvent.DataReceived, ...)` を別フックで行う想定
 * （`useMatchingDataChannel` のような専用フックを step11 拡張で導入する余地）。
 */
export function useLiveKitRoom(input: UseLiveKitRoomInput): UseLiveKitRoomResult {
  const [room, setRoom] = useState<Room | null>(null)
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null)
  const [error, setError] = useState<string | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!input.enabled || input.sessionId === null) return

    cancelledRef.current = false
    const r = new Room()

    const connect = async () => {
      const result = await issueMatchingTokenAction(input.sessionId!)
      if (cancelledRef.current) return
      if (!result.ok) {
        setError(result.error)
        return
      }

      try {
        await r.connect(result.data.livekit_url, result.data.token)
        if (cancelledRef.current) return

        await r.localParticipant.setCameraEnabled(true)
        await r.localParticipant.setMicrophoneEnabled(true)

        r.on(RoomEvent.ParticipantConnected, (participant) => {
          if (!cancelledRef.current) setRemoteParticipant(participant)
        })
        r.on(RoomEvent.ParticipantDisconnected, () => {
          if (!cancelledRef.current) setRemoteParticipant(null)
        })

        /** 接続時点で既に他参加者がいる場合をハンドリング */
        const existing = Array.from(r.remoteParticipants.values())[0] ?? null
        setRemoteParticipant(existing)
        setRoom(r)
      } catch (e) {
        if (!cancelledRef.current) {
          setError(e instanceof Error ? e.message : "LiveKit connection failed")
        }
      }
    }

    void connect()

    return () => {
      cancelledRef.current = true
      void r.disconnect()
    }
    /** sessionId / enabled が確定した一度だけ接続する */
  }, [input.enabled, input.sessionId])

  return { error, remoteParticipant, room }
}
