"use client"

import { useCallback, useEffect, useState } from "react"

import { ConfettiEffect } from "@/components/ui/confetti-effect"

import { startMatchingSessionAction, submitReactionAction } from "../../actions"
import { BottomControls } from "../active/BottomControls"
import { HypeCommentOverlay } from "../active/HypeCommentOverlay"
import { MediaPermissionBanner } from "../active/MediaPermissionBanner"
import { StampFloatLayer } from "../active/StampFloatLayer"
import { ThemeCard } from "../active/ThemeCard"
import { ThemeTimerBar } from "../active/ThemeTimerBar"
import { VideoPanel } from "../active/VideoPanel"
import { useLiveKitRoom } from "../hooks/useLiveKitRoom"
import {
  type MatchingEndedEvent,
  type MatchingHypeEvent,
  type MatchingReactionMatchEvent,
  type MatchingStampEvent,
  type MatchingThemeEvent,
  type MatchingTimerEvent,
  useMatchingDataChannel,
} from "../hooks/useMatchingDataChannel"
import type { MatchedSession } from "../MatchingSession"

type Props = {
  isSelfUser1: boolean
  onEnd: () => void
  session: MatchedSession
  userId: number
}

type ReceivedStamp = { emoji: string; id: string }

/**
 * セッション中（active）の画面。
 *
 * 状態:
 * - currentTheme: matching:theme 受信で更新。CHOICE / FREE_TALK に応じて UI 切替
 * - hypeMessage: matching:hype の最新メッセージ。`HypeCommentOverlay` が 2 秒表示
 * - remainingSeconds / canEndNow: matching:timer の最新値。バーと終了ボタンの活性に反映
 * - stamps: matching:stamp を受信したぶんだけ追加。`StampFloatLayer` が表示 / 自然減衰
 * - matching:ended → onEnd() で結果画面遷移
 * - matching:reaction_match は本 PR では受信ログのみ（紙吹雪などの polish は将来）
 *
 * mount 時に `POST /matching/sessions/:id/start` を呼んでテーマ進行ジョブを enqueue する（step8a）。
 * 同 jobId で冪等に作られているので 2 回 mount しても問題ない。
 */
export function ActiveState({ isSelfUser1, onEnd, session, userId }: Props) {
  const { remoteParticipant, room, error } = useLiveKitRoom({
    enabled: true,
    sessionId: session.sessionId,
  })

  const [currentTheme, setCurrentTheme] = useState<MatchingThemeEvent | null>(null)
  const [hypeMessage, setHypeMessage] = useState<string | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState<number>(600)
  const [canEndNow, setCanEndNow] = useState(false)
  const [stamps, setStamps] = useState<ReceivedStamp[]>([])
  const [reactedRoundNumber, setReactedRoundNumber] = useState<number | null>(null)
  /** ConfettiEffect の trigger key。`matching:reaction_match` で matched=true を受信した時に更新 */
  const [confettiTrigger, setConfettiTrigger] = useState<number | null>(null)

  /** mount で start を 1 回呼ぶ */
  useEffect(() => {
    void startMatchingSessionAction(session.sessionId)
  }, [session.sessionId])

  /** matching:theme 受信時はラウンドが変わるので reaction の disabled 状態をリセット */
  const handleTheme = useCallback((ev: MatchingThemeEvent) => {
    setCurrentTheme(ev)
    setReactedRoundNumber((cur) => (cur === ev.round_number ? cur : null))
  }, [])

  const handleHype = useCallback((ev: MatchingHypeEvent) => {
    setHypeMessage(ev.message)
    /** 2 秒後に自動非表示。HypeCommentOverlay 側で effect を持たないことで lint ルールに準拠 */
    setTimeout(() => {
      setHypeMessage((cur) => (cur === ev.message ? null : cur))
    }, 2000)
  }, [])

  const handleTimer = useCallback((ev: MatchingTimerEvent) => {
    setRemainingSeconds(ev.remaining_seconds)
    setCanEndNow(ev.can_end_now)
  }, [])

  const handleStamp = useCallback((ev: MatchingStampEvent) => {
    /** 同時受信の衝突を避けるため id にカウンタを付ける */
    setStamps((prev) => {
      const id = `${Date.now()}-${ev.sender_id}-${prev.length}`
      const next = [...prev, { emoji: ev.emoji, id }]
      /** 古いスタンプを自然減衰（最新 12 件のみ保持） */
      return next.length > 12 ? next.slice(-12) : next
    })
    /** 表示時間（StampFloatLayer の transition 2.4s）後に取り除く */
    setTimeout(() => {
      setStamps((prev) => prev.filter((_, idx) => idx !== 0))
    }, 2400)
  }, [])

  const handleEnded = useCallback(
    (_ev: MatchingEndedEvent) => {
      onEnd()
    },
    [onEnd],
  )

  /** 一致演出: matching:reaction_match 受信で matched=true なら ConfettiEffect を再発火 */
  const handleReactionMatch = useCallback((ev: MatchingReactionMatchEvent) => {
    if (ev.matched) setConfettiTrigger(Date.now())
  }, [])

  useMatchingDataChannel(room, {
    onEnded: handleEnded,
    onHype: handleHype,
    onReactionMatch: handleReactionMatch,
    onStamp: handleStamp,
    onTheme: handleTheme,
    onTimer: handleTimer,
  })

  /** 選択肢クリック時の reaction 送信 */
  const handleSelectChoice = useCallback(
    (choiceId: number | null) => {
      if (!currentTheme) return
      if (reactedRoundNumber === currentTheme.round_number) return
      setReactedRoundNumber(currentTheme.round_number)
      void submitReactionAction({
        choiceId,
        roundNumber: currentTheme.round_number,
        sessionId: session.sessionId,
        themeId: currentTheme.theme_id,
      })
    },
    [currentTheme, reactedRoundNumber, session.sessionId],
  )

  const localLabel = userId === session.peer.id ? "相手" : "あなた"
  const peerLabel = session.peer.name ?? "相手"

  return (
    <div className="relative min-h-screen overflow-hidden bg-dark-base">
      <ThemeTimerBar remainingSeconds={remainingSeconds} />

      <div className="grid min-h-screen grid-cols-1 gap-2 p-2 pt-10 sm:grid-cols-2">
        <VideoPanel
          isSpotlight={currentTheme?.speaker === "user1" ? isSelfUser1 : !isSelfUser1}
          label={localLabel}
          participant={room?.localParticipant ?? null}
        />
        <VideoPanel
          isSpotlight={currentTheme?.speaker === "user1" ? !isSelfUser1 : isSelfUser1}
          label={peerLabel}
          participant={remoteParticipant}
        />
      </div>

      {currentTheme && (
        <div className="pointer-events-none absolute inset-x-0 bottom-24 z-10 px-4">
          <ThemeCard
            disabled={reactedRoundNumber === currentTheme.round_number}
            onSelectChoice={handleSelectChoice}
            theme={currentTheme}
          />
        </div>
      )}

      <HypeCommentOverlay message={hypeMessage} />
      <StampFloatLayer stamps={stamps} />
      {confettiTrigger !== null && <ConfettiEffect trigger={confettiTrigger} />}

      <BottomControls canEndNow={canEndNow} onEnd={onEnd} room={room} />

      {error && (
        <MediaPermissionBanner
          error={error}
          onRetry={() => {
            /**
             * カメラ / マイク権限の再取得は location.reload が最も確実（permissions API で
             * 再 prompt させる経路はブラウザによって挙動が不安定）。Room 接続失敗 / token 失敗の
             * 場合も同じくリロードでクリーンに再試行する。
             */
            window.location.reload()
          }}
        />
      )}
    </div>
  )
}
