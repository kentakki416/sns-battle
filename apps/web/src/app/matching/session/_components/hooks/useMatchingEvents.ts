"use client"

import { useEffect } from "react"

import type { MatchingEvent } from "@repo/api-schema"

type UseMatchingEventsInput = {
  enabled: boolean
  onEvent: (event: MatchingEvent) => void
}

/**
 * `/api/matching/events`（Same-Origin の Next.js Route Handler 経由で Express SSE をプロキシ）を
 * `EventSource` で購読するフック。
 *
 * - `enabled=false` の間は接続しない（matched 後など SSE を切りたいときに使う）
 * - `MatchingEvent` 型でパースした上で `onEvent` に渡す
 * - パース失敗はサイレントに無視（運用で起きないはずだが防御的に）
 * - クライアント切断 / unmount で `EventSource.close()` を呼ぶ
 *
 * 注: Same-Origin のため `withCredentials` は不要（cookie は自動付与）。
 */
export function useMatchingEvents({ enabled, onEvent }: UseMatchingEventsInput): void {
  useEffect(() => {
    if (!enabled) return
    const source = new EventSource("/api/matching/events")

    source.onmessage = (msg) => {
      try {
        const ev = JSON.parse(msg.data) as MatchingEvent
        onEvent(ev)
      } catch {
        /** 不正な JSON は無視 */
      }
    }

    /**
     * 接続エラー時のリトライは EventSource が自動で行う。明示的なクローズ条件
     * （matched → state 遷移）は呼び出し側で `enabled=false` に切り替えてもらう。
     */
    return () => {
      source.close()
    }
  }, [enabled, onEvent])
}
