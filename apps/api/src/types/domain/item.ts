/**
 * アイテムの種類（items.type）
 */
export type ItemType = "STAMP" | "EFFECT" | "BOOST" | "DECORATION" | "SUBSCRIPTION"

/**
 * アイテムが使用できるシーン（item_scopes.scope）
 */
export type ItemScopeKey = "MATCHING" | "BATTLE" | "STREAMING" | "PROFILE"

/**
 * スタンプアニメーション種別（stamp_details.animation_type）
 */
export type StampAnimationType = "NONE" | "FLOAT" | "BOUNCE" | "EXPLODE" | "SHAKE"

/**
 * Spec1 のスタンプ送信 API（POST /api/matching/sessions/:id/stamp）が使う
 * MATCHING スコープ向けスタンプの最小ビュー。
 *
 * `items` + `item_scopes` + `stamp_details` の JOIN を 1 オブジェクトに畳み込む。
 */
export type StampForMatching = {
    id: number
    animationType: StampAnimationType
    emoji: string
    isPremium: boolean
    name: string
}
