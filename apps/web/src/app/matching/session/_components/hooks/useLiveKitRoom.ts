"use client"

import { Room, RoomEvent, type RemoteParticipant } from "livekit-client"
import { useEffect, useRef, useState } from "react"

import { issueMatchingTokenAction } from "../../actions"

type UseLiveKitRoomInput = {
  enabled: boolean
  sessionId: number | null
}

/**
 * 接続失敗の種類。UI 側でメッセージや復旧導線を切り替えるために enum 化する。
 *
 * - `permission_denied`: ブラウザのカメラ / マイク許可が拒否された
 * - `connection_failed`: LiveKit Cloud との接続に失敗（network / token 不正 等）
 * - `token_failed`: Server Action の token 発行が失敗（API 障害 / 認可エラー）
 */
export type LiveKitRoomErrorKind =
    | "connection_failed"
    | "permission_denied"
    | "token_failed"

export type UseLiveKitRoomError = {
    kind: LiveKitRoomErrorKind
    message: string
}

type UseLiveKitRoomResult = {
  error: UseLiveKitRoomError | null
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
  const [error, setError] = useState<UseLiveKitRoomError | null>(null)
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!input.enabled || input.sessionId === null) return

    cancelledRef.current = false
    const r = new Room()

    const connect = async () => {
      const result = await issueMatchingTokenAction(input.sessionId!)
      if (cancelledRef.current) return
      if (!result.ok) {
        setError({ kind: "token_failed", message: result.error })
        return
      }

      try {
        await r.connect(result.data.livekit_url, result.data.token)
        if (cancelledRef.current) return

        /**
         * カメラ / マイクは権限拒否で個別に失敗しうるため、Room 接続成功後に try / catch で
         * 分離して扱う。失敗時は permission_denied として UI に通知する（Room は接続済なので
         * 相手のビデオ表示や Data Channel 受信はそのまま継続）。
         */
        try {
          await r.localParticipant.setCameraEnabled(true)
          await r.localParticipant.setMicrophoneEnabled(true)
        } catch (mediaErr) {
          if (!cancelledRef.current) {
            setError({
              kind: "permission_denied",
              message: mediaErr instanceof Error ? mediaErr.message : "Media permission denied",
            })
          }
        }

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
          setError({
            kind: "connection_failed",
            message: e instanceof Error ? e.message : "LiveKit connection failed",
          })
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
