"use client"

import { type Room, RoomEvent } from "livekit-client"
import { useEffect } from "react"

/**
 * LiveKit Data Channel で受け取るマッチングイベントの discriminated union。
 *
 * payload 形は API / matching-worker 側の publishData 呼び出し（apps/api/src/service/matching-service.ts
 * の submitReaction / sendMatchingStamp、apps/matching-worker/src/jobs/*）と完全一致する。
 * 共有 schema パッケージ（@repo/api-schema）に持ち上げる方が綺麗だが、wire 仕様が固まるまでは
 * 本ファイルでローカル型として扱う。
 */
export type MatchingThemeEvent = {
    choices: { emoji: string; id: number; label: string }[]
    duration: number
    round_number: number
    speaker: "user1" | "user2"
    theme_id: number
    title: string
    type: "CHOICE" | "FREE_TALK"
}

export type MatchingHypeEvent = {
    message: string
}

export type MatchingReactionMatchEvent = {
    matched: boolean
    round_number: number
    theme_id: number
    user1_choice_id: number | null
    user2_choice_id: number | null
}

export type MatchingStampEvent = {
    animation_type: "NONE" | "FLOAT" | "BOUNCE" | "EXPLODE" | "SHAKE"
    emoji: string
    item_id: number
    sender_id: number
}

export type MatchingTimerEvent = {
    can_end_now: boolean
    remaining_seconds: number
}

export type MatchingEndedEvent = {
    reason: "TIMEOUT" | "USER_LEFT" | "MANUAL"
}

export type MatchingDataChannelHandlers = {
    onEnded?: (event: MatchingEndedEvent) => void
    onHype?: (event: MatchingHypeEvent) => void
    onReactionMatch?: (event: MatchingReactionMatchEvent) => void
    onStamp?: (event: MatchingStampEvent) => void
    onTheme?: (event: MatchingThemeEvent) => void
    onTimer?: (event: MatchingTimerEvent) => void
}

/**
 * LiveKit Room の Data Channel を購読し、topic 別に payload を dispatch するフック。
 *
 * - `room` が未接続の間は no-op
 * - payload は UTF-8 + JSON のみ想定（matching の publishData は全てこの形式）
 * - 不正な JSON / 未知の topic はサイレントに無視（防御的）
 *
 * 各 handler は呼び出し側で `useCallback` 化して安定参照を渡すこと。
 */
export function useMatchingDataChannel(
  room: Room | null,
  handlers: MatchingDataChannelHandlers,
): void {
  useEffect(() => {
    if (!room) return

    const listener = (
      payload: Uint8Array,
      _participant?: unknown,
      _kind?: unknown,
      topic?: string,
    ) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(new TextDecoder().decode(payload))
      } catch {
        return
      }

      switch (topic) {
      case "matching:theme":
        handlers.onTheme?.(parsed as MatchingThemeEvent)
        return
      case "matching:hype":
        handlers.onHype?.(parsed as MatchingHypeEvent)
        return
      case "matching:reaction_match":
        handlers.onReactionMatch?.(parsed as MatchingReactionMatchEvent)
        return
      case "matching:stamp":
        handlers.onStamp?.(parsed as MatchingStampEvent)
        return
      case "matching:timer":
        handlers.onTimer?.(parsed as MatchingTimerEvent)
        return
      case "matching:ended":
        handlers.onEnded?.(parsed as MatchingEndedEvent)
        return
      default:
        /** 未知の topic は無視 */
      }
    }

    room.on(RoomEvent.DataReceived, listener)
    return () => {
      room.off(RoomEvent.DataReceived, listener)
    }
  }, [room, handlers])
}
