/**
 * 性別
 */
export type Gender = "MALE" | "FEMALE" | "OTHER"

/**
 * ユーザードメイン型
 */
export type User = {
    avatarUrl: string | null
    /**
     * 自己紹介文（プロフィール画面で表示）。
     * Google からは取得できないためオンボーディング or プロフィール編集で入力する。
     */
    bio: string | null
    /**
     * 生年月日。is_onboarded=true のユーザーは必ず値を持つ。
     */
    birthDate: Date | null
    /**
     * コイン残高（将来フェーズ：課金・ショップ）。
     */
    coinBalance: number
    createdAt: Date
    email: string | null
    /**
     * 性別。is_onboarded=true のユーザーは必ず値を持つ。
     */
    gender: Gender | null
    id: number
    /**
     * オンボーディング完了フラグ。
     * 初回ログイン後の必須プロフィール設定（表示名・生年月日・性別など）が完了したら true に更新する。
     * サインイン直後にこの値が false なら /onboarding へ誘導する。
     */
    isOnboarded: boolean
    /**
     * 居住地域。任意項目。
     */
    location: string | null
    /**
     * MBTI タイプ（INTJ, ENFP 等）。任意項目。
     */
    mbti: string | null
    name: string | null
    updatedAt: Date
}
