/**
 * worker が扱う最小限のドメイン型。apps/api 側 `src/types/domain` の定義を必要なフィールドだけ
 * 抜き出して同名で再定義している。両者で構造が乖離しないようにフィールド差分のみで合わせる。
 */

export type MatchingSessionStatus = "COUNTDOWN" | "ACTIVE" | "ENDED"
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

export type TalkThemeType = "CHOICE" | "FREE_TALK"
export type TalkThemeCategory = "MATCHING" | "BATTLE"

export type TalkTheme = {
    id: number
    category: TalkThemeCategory
    /** 1 ラウンドの想定秒数（テーマ進行で再 enqueue する delay に使う） */
    duration: number
    isActive: boolean
    sortOrder: number
    /** 推奨スコア上限（包含）。null = 上限なし */
    targetScoreMax: number | null
    /** 推奨スコア下限（包含）。null = 下限なし */
    targetScoreMin: number | null
    title: string
    type: TalkThemeType
}

export type TalkThemeChoice = {
    id: number
    emoji: string
    label: string
    sortOrder: number
    themeId: number
}

export type TalkThemeWithChoices = {
    choices: TalkThemeChoice[]
    theme: TalkTheme
}
