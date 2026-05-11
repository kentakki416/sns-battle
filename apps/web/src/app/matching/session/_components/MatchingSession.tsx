"use client"

import { AnimatePresence } from "framer-motion"
import { useRouter } from "next/navigation"
import { useCallback, useEffect, useRef, useState } from "react"

import type { JoinMatchingResponse, MatchingEvent, MatchingPeer } from "@repo/api-schema"

import { endMatchingSessionAction, joinMatchingAction, leaveMatchingAction } from "../actions"

import { useMatchingEvents } from "./hooks/useMatchingEvents"
import { ActiveState } from "./states/ActiveState"
import { CountdownState } from "./states/CountdownState"
import { MatchedState } from "./states/MatchedState"
import { WaitingState } from "./states/WaitingState"

type MatchingState = "waiting" | "matched" | "countdown" | "active"

/**
 * 成立済セッション。`JoinMatchingResponse` は schema 上 nullable な扱いだが、`matched=true` の
 * 場合は `peer` / `session_id` / `livekit_room_name` が必ず非 null で返る前提なので narrow した型を使う。
 */
export type MatchedSession = {
  livekitRoomName: string
  peer: MatchingPeer
  sessionId: number
}

type Props = {
  userId: number
}

const toMatchedSession = (res: JoinMatchingResponse): MatchedSession | null => {
  if (!res.matched) return null
  if (res.peer === null || res.session_id === null || res.livekit_room_name === null) return null
  return {
    livekitRoomName: res.livekit_room_name,
    peer: res.peer,
    sessionId: res.session_id,
  }
}

/**
 * `/matching/session` のルートコントローラ。状態マシンとして 4 状態を遷移する。
 *
 * 1. mount: `joinMatchingAction()` を 1 回呼ぶ
 *    - matched=true なら matched 状態へ即遷移
 *    - matched=false なら waiting 状態のまま SSE `/api/matching/events` を購読し、
 *      `type: "matched"` イベント受信で matched 状態へ非同期遷移する
 * 2. matched: 2 秒だけ peer プロフィールを表示してから countdown へ
 * 3. countdown: 3-2-1-GO! のオーバーレイ。完了で active へ
 * 4. active: LiveKit 接続 + テーマ進行 / タイマー UI（active 内部で start enqueue）
 *
 * unmount で waiting 中なら `leaveMatchingAction()` を呼んで Redis / DB のキューを掃除する。
 */
export function MatchingSession({ userId }: Props) {
  const router = useRouter()
  const [state, setState] = useState<MatchingState>("waiting")
  const [session, setSession] = useState<MatchedSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const stateRef = useRef<MatchingState>("waiting")
  /** state の最新値を unmount 時の cleanup で参照するため effect で同期する */
  useEffect(() => {
    stateRef.current = state
  }, [state])

  /** mount 時に join を 1 回だけ実行 */
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await joinMatchingAction()
      if (cancelled) return
      if (!result.ok) {
        setError(result.error)
        return
      }
      const matched = toMatchedSession(result.data)
      if (matched) {
        setSession(matched)
        setState("matched")
      }
    })()

    return () => {
      cancelled = true
      /** waiting 中の離脱なら queue を掃除する */
      if (stateRef.current === "waiting") {
        void leaveMatchingAction()
      }
    }
  }, [])

  /**
   * waiting 中のみ SSE を購読し、`matched` イベント受信で session を確定する。
   * matched 以降は SSE を切る（同じイベントを heartbeat 含めて受信し続ける必要がない）。
   */
  const handleSseEvent = useCallback((ev: MatchingEvent) => {
    if (ev.type !== "matched") return
    setSession({
      livekitRoomName: ev.livekit_room_name,
      peer: ev.peer,
      sessionId: ev.session_id,
    })
    setState((cur) => (cur === "waiting" ? "matched" : cur))
  }, [])
  useMatchingEvents({ enabled: state === "waiting", onEvent: handleSseEvent })

  /** matched に入ったら 2 秒後に countdown */
  useEffect(() => {
    if (state !== "matched") return
    const t = setTimeout(() => setState("countdown"), 2000)
    return () => clearTimeout(t)
  }, [state])

  const handleCancel = () => {
    void leaveMatchingAction()
    router.push("/matching")
  }

  const handleSessionEnd = () => {
    if (!session) {
      router.push("/matching")
      return
    }
    /**
     * 終了ボタン経由（matching:ended 受信ではない）の場合は MANUAL で session を ENDED 化する。
     * matching:ended 経由（タイムアウト / ユーザー離脱）でも本ハンドラが呼ばれるが、その場合
     * サーバー側で既に ENDED になっているため endMatchingSessionAction は 410 を返す。失敗しても
     * 結果画面遷移は止めない。
     */
    void endMatchingSessionAction(session.sessionId)
    router.push(`/matching/result?session_id=${session.sessionId}`)
  }

  /**
   * `is_self_user1` は `JoinMatchingResponse` には含まれないため、初期版は左パネル = 自分の前提で
   * `true` を渡す（peer.id と userId の比較で多少推測できるが厳密でないため割り切る）。
   * 詳細な VS レイアウト割当は GET /sessions/:id 側で取得する後続改修で詰める。
   */
  const isSelfUser1 = true

  return (
    <main className="min-h-screen">
      <AnimatePresence mode="wait">
        {state === "waiting" && (
          <WaitingState key="waiting" onCancel={handleCancel} />
        )}
        {state === "matched" && session && (
          <MatchedState key="matched" peer={session.peer} />
        )}
        {state === "countdown" && (
          <CountdownState key="countdown" onComplete={() => setState("active")} />
        )}
        {state === "active" && session && (
          <ActiveState
            isSelfUser1={isSelfUser1}
            key="active"
            onEnd={handleSessionEnd}
            session={session}
            userId={userId}
          />
        )}
      </AnimatePresence>

      {error && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-error/80 px-4 py-1 text-xs text-white">
          {error}
        </div>
      )}
    </main>
  )
}
