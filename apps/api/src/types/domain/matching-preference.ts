import type { Gender } from "./user"

/**
 * マッチングフィルタ設定（matching_preferences）のドメイン型
 *
 * 配列カラムは空配列 = 制限なし。NULL は使わず空配列で統一する。
 * レコードはユーザー作成時には作らず、フィルタ初設定時に upsert する。
 */
export type MatchingPreference = {
    /** 希望する最大年齢（null = 制限なし） */
    ageMax: number | null
    /** 希望する最小年齢（null = 制限なし） */
    ageMin: number | null
    id: number
    /** 希望する相手の性別（空配列 = 制限なし） */
    preferredGenders: Gender[]
    /** 希望する相手の趣味 hobby_master.id（空配列 = 制限なし） */
    preferredHobbyIds: number[]
    /** 希望する相手の居住地域（空配列 = 制限なし） */
    preferredLocations: string[]
    /** 希望する相手の MBTI 値（空配列 = 制限なし） */
    preferredMbti: string[]
    userId: number
}
