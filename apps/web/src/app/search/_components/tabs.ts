export type SearchTab = "all" | "stream" | "user" | "battle"

export const SEARCH_TABS: ReadonlyArray<{ disabled: boolean; key: SearchTab; label: string }> = [
  /**
   * 「すべて」は streams / users / battles の 3 API を並列呼び出しする想定だが、streams / battles の
   * 検索 API は Phase 8 / 9 で実装されるため、本フェーズでは disabled にする。
   */
  { disabled: true, key: "all", label: "すべて" },
  { disabled: true, key: "stream", label: "配信" },
  { disabled: false, key: "user", label: "ユーザー" },
  { disabled: true, key: "battle", label: "バトル" },
]
