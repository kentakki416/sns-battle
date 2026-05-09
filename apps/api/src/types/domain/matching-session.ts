/**
 * 1対1マッチングセッション（matching_sessions）のドメイン型
 *
 * COUNTDOWN → ACTIVE → ENDED の状態遷移。
 * livekitRoomName は `matching:{sessionId}` 形式で生成する（具体的なフォーマットは sessions API 実装時に確定）。
 */
export type MatchingSessionStatus = "COUNTDOWN" | "ACTIVE" | "ENDED"

/**
 * セッションが終了した理由。
 * TIMEOUT: テーマ進行が全ラウンド完了 / USER_LEFT: 片方が退出 / MANUAL: 手動終了
 */
export type MatchingEndReason = "TIMEOUT" | "USER_LEFT" | "MANUAL"

export type MatchingSession = {
    createdAt: Date
    endedAt: Date | null
    endReason: MatchingEndReason | null
    id: number
    livekitRoomName: string
    startedAt: Date | null
    status: MatchingSessionStatus
    user1Id: number
    user2Id: number
}
