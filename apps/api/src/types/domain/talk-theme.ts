/**
 * トークテーマ（talk_themes）のドメイン型
 *
 * - CHOICE: 選択肢から 1 つ選んで送信するテーマ
 * - FREE_TALK: 選択肢無し（matching reaction の matched は常に null）
 *
 * カテゴリは MATCHING / BATTLE。Spec1 では MATCHING のみ使用。
 */
export type TalkThemeType = "CHOICE" | "FREE_TALK"
export type TalkThemeCategory = "MATCHING" | "BATTLE"

export type TalkTheme = {
    id: number
    category: TalkThemeCategory
    /** 1 ラウンドの想定秒数（テーマ進行タイマー step8 で使用） */
    duration: number
    isActive: boolean
    sortOrder: number
    title: string
    type: TalkThemeType
}

/**
 * トークテーマ選択肢（talk_theme_choices）。type=CHOICE のテーマに紐づく。
 */
export type TalkThemeChoice = {
    id: number
    emoji: string
    label: string
    sortOrder: number
    themeId: number
}

/**
 * 選択肢込みのテーマ詳細。Service 層が CHOICE バリデーションや
 * リアクションラベル付与で使う。
 */
export type TalkThemeWithChoices = {
    choices: TalkThemeChoice[]
    theme: TalkTheme
}
