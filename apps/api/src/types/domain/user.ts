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
    createdAt: Date
    email: string | null
    id: number
    /**
     * オンボーディング完了フラグ。
     * 初回ログイン後の必須プロフィール設定（表示名・生年月日・性別など）が完了したら true に更新する。
     * サインイン直後にこの値が false なら /onboarding へ誘導する。
     */
    isOnboarded: boolean
    name: string | null
    updatedAt: Date
}
