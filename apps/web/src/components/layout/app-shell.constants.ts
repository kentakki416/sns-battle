/**
 * Navbar / Sidebar をともに非表示にする immersive モードの対象パス（前方一致）。
 * /battles/{id} は別関数 isBattleDetailPath で判定する（一覧 /battles を除外するため）。
 */
export const IMMERSIVE_PATH_PREFIXES: ReadonlyArray<string> = [
  "/sign-in",
  "/stream/",
  "/matching/session",
]

/**
 * Navbar のみ表示しサイドバーを非表示にするパス（完全一致）。
 */
export const NO_SIDEBAR_PATHS: ReadonlyArray<string> = [
  "/battles",
]

export const isBattleDetailPath = (pathname: string): boolean => {
  return pathname.startsWith("/battles/") && pathname !== "/battles"
}
