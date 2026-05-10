"use client"

import Link from "next/link"

/**
 * マッチングロビーのヘッダーセクション。
 *
 * - h1 + サブテキスト
 * - メインの「マッチング開始」CTA（3 点グラデ + 背景アニメ + ホバーで scale）
 * - 「フィルター設定」ボタン（Coming Soon。実機能は別 step で /matching/preferences と統合検討）
 */
export function MatchingHero() {
  return (
    <header className="mb-10 text-center">
      <h1 className="text-3xl font-bold text-white sm:text-4xl">
        🤝 マッチング
      </h1>
      <p className="mt-2 text-sm text-text-muted">
        通話相手を探して、10 ラウンドのテーマトークで盛り上がろう
      </p>

      <div className="mt-8 flex flex-col items-center gap-4">
        <Link
          aria-label="マッチング開始"
          className="group relative inline-flex w-full max-w-xs items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(120deg,#CBACF9_0%,#0EA5E9_50%,#EC4899_100%)] px-10 py-4 text-base font-semibold text-white shadow-[0_0_24px_rgba(203,172,249,0.35)] transition hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          href="/matching/session"
          style={{
            animation: "gradient-shift 6s ease infinite",
            backgroundSize: "200% 200%",
          }}
        >
          <span className="relative z-10">マッチング開始</span>
        </Link>

        <button
          aria-disabled="true"
          className="cursor-not-allowed text-xs text-text-muted underline-offset-4 hover:underline"
          disabled
          type="button"
        >
          フィルター設定（Coming Soon）
        </button>
      </div>
    </header>
  )
}
