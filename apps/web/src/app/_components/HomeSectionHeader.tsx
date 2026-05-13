import type { ReactNode } from "react"

type Props = {
  badgeBgClass: string
  count?: number
  icon: ReactNode
  title: string
}

/**
 * ホームフィードの各セクションの見出し（アイコンボックス + タイトル + 件数バッジ）。
 * 件数バッジは `count` が未指定なら非表示にする（Phase 8/9 のテーブル未投入セクション向け）。
 */
export function HomeSectionHeader({ badgeBgClass, count, icon, title }: Props) {
  return (
    <header className="mb-5 flex items-center gap-3">
      <span
        className={`flex h-8 w-8 items-center justify-center rounded-lg ${badgeBgClass}`}
        aria-hidden
      >
        {icon}
      </span>
      <h2 className="text-lg font-bold text-white">{title}</h2>
      {count !== undefined ? (
        <span className="rounded-full bg-white/[0.03] px-2 py-0.5 text-xs text-text-muted">
          {count}
        </span>
      ) : null}
    </header>
  )
}
