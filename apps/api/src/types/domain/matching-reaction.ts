/**
 * トークテーマへの回答記録（matching_reactions）のドメイン型
 *
 * 1セッション内で同一ユーザーが同一ラウンドに回答できるのは1回（unique 制約）。
 * choiceId は type=CHOICE のテーマでのみ設定され、FREE_TALK では null。
 */
export type MatchingReaction = {
    choiceId: number | null
    createdAt: Date
    id: number
    roundNumber: number
    sessionId: number
    themeId: number
    userId: number
}
