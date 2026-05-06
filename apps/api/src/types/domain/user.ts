/**
 * ユーザードメイン型
 */
export type User = {
    avatarUrl: string | null
    bio: string | null
    createdAt: Date
    email: string | null
    id: number
    isOnboarded: boolean
    name: string | null
    updatedAt: Date
}
