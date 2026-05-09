/**
 * マッチング待機キュー（matching_queue）のドメイン型
 *
 * Redis Sorted Set がプライマリストレージで、DB はバックアップ／監査用。
 * 実運用では status は WAITING のみ使われる（マッチング成立時はレコード自体を削除）。
 */
export type MatchingQueueStatus = "WAITING" | "MATCHED" | "CANCELLED"

export type MatchingQueue = {
    createdAt: Date
    id: number
    status: MatchingQueueStatus
    updatedAt: Date
    userId: number
}
