"use client"

import { SEARCH_TABS, type SearchTab } from "./tabs"

type Props = {
  activeTab: SearchTab
  onChange: (next: SearchTab) => void
}

/**
 * `/search` の 4 タブ（すべて / 配信 / ユーザー / バトル）。
 * 配信 / バトル タブは Phase 8 / 9 で対応 API が実装された後に有効化する。
 * 本フェーズではユーザータブのみ active、他は disabled で「準備中」と表示する。
 */
export function SearchTabs({ activeTab, onChange }: Props) {
  return (
    <div className="glass-card flex gap-1 rounded-2xl p-1">
      {SEARCH_TABS.map((tab) => {
        const isActive = activeTab === tab.key
        const isDisabled = tab.disabled
        const className = isActive
          ? "flex-1 rounded-xl bg-gradient-to-r from-primary to-cyan px-4 py-2 text-sm font-semibold text-dark-base shadow-[0_0_12px_rgba(203,172,249,0.15)]"
          : isDisabled
            ? "flex-1 rounded-xl px-4 py-2 text-sm text-text-disabled cursor-not-allowed"
            : "flex-1 rounded-xl px-4 py-2 text-sm text-text-muted transition hover:text-white"
        return (
          <button
            className={className}
            disabled={isDisabled}
            key={tab.key}
            onClick={() => onChange(tab.key)}
            title={isDisabled ? "準備中（Phase 8 / 9）" : undefined}
            type="button"
          >
            {tab.label}
            {isDisabled ? " (準備中)" : null}
          </button>
        )
      })}
    </div>
  )
}
