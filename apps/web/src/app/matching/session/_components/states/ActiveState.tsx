"use client"

import { useEffect, useState } from "react"

import { startMatchingSessionAction } from "../../actions"
import { BottomControls } from "../active/BottomControls"
import { VideoPanel } from "../active/VideoPanel"
import { useLiveKitRoom } from "../hooks/useLiveKitRoom"
import type { MatchedSession } from "../MatchingSession"

type Props = {
  isSelfUser1: boolean
  onEnd: () => void
  session: MatchedSession
  userId: number
}

/**
 * セッション中（active）の画面。
 *
 * 本 step 範囲では LiveKit Room 接続 + 自分／相手のビデオパネル + ミュート / カメラ / 終了の
 * 最低限のレイアウトのみ。Data Channel イベント（matching:theme / hype / reaction_match /
 * stamp / timer / ended）の購読 + UI への反映は後続 PR で `useMatchingDataChannel` フックを
 * 追加して接続する想定。
 *
 * mount 時に `POST /matching/sessions/:id/start` を 1 回呼んで サーバー側のテーマ進行 / タイマー /
 * タイムアウトジョブを enqueue させる（step8a）。
 */
export function ActiveState({ isSelfUser1, onEnd, session, userId }: Props) {
  const { remoteParticipant, room, error } = useLiveKitRoom({
    enabled: true,
    sessionId: session.sessionId,
  })
  const [canEndNow, setCanEndNow] = useState(false)

  /**
   * mount 時にテーマ進行 / タイマー / タイムアウトジョブを enqueue。冪等なので 1 セッションで
   * 何度走っても問題ないが、再 mount を避けるため StrictMode の二重実行は許容する。
   */
  useEffect(() => {
    void startMatchingSessionAction(session.sessionId)
  }, [session.sessionId])

  /** 暫定: 5 分経過で終了ボタンを有効化（matching:timer 受信に置き換え予定） */
  useEffect(() => {
    const t = setTimeout(() => setCanEndNow(true), 300_000)
    return () => clearTimeout(t)
  }, [])

  const localLabel = userId === session.peer.id ? "相手" : "あなた"
  const peerLabel = session.peer.name ?? "相手"

  return (
    <div className="relative min-h-screen bg-dark-base">
      <div className="grid min-h-screen grid-cols-1 gap-2 p-2 sm:grid-cols-2">
        <VideoPanel
          isSpotlight={isSelfUser1}
          label={localLabel}
          participant={room?.localParticipant ?? null}
        />
        <VideoPanel
          isSpotlight={!isSelfUser1}
          label={peerLabel}
          participant={remoteParticipant}
        />
      </div>

      <BottomControls canEndNow={canEndNow} onEnd={onEnd} room={room} />

      {error && (
        <div className="absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-error/80 px-4 py-1 text-xs text-white">
          LiveKit 接続エラー: {error}
        </div>
      )}
    </div>
  )
}
