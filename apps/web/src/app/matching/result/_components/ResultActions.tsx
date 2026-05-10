"use client"

import Link from "next/link"

type Props = {
  /**
   * フォロー対象ユーザーの id。Phase 5 の `POST /api/users/:id/follow` で使う。
   * 現状は未実装のためボタンは disabled。
   */
  peerId: number
}

/**
 * 結果画面のアクションエリア。
 * - 左: 「ホームに戻る」（`<Link href="/">`）
 * - 右: 「フォローする」 — Phase 5 未実装のため disabled + Coming Soon ラベル
 */
export function ResultActions({ peerId }: Props) {
  /**
   * peerId は Phase 5 でフォロー API 呼び出し時に使う。
   * 現状は未使用だが、将来の改修コストを下げるため Props として受け取っておく。
   */
  void peerId

  return (
    <div className="mt-6 flex items-center gap-3">
      <Link
        className="h-11 flex-1 rounded-xl border border-dark-border px-6 py-3 text-center text-sm text-text-muted transition hover:text-white"
        href="/"
      >
        ホームに戻る
      </Link>
      <button
        className="h-11 flex-1 rounded-xl text-sm font-semibold text-dark-base disabled:cursor-not-allowed disabled:opacity-50"
        disabled
        style={{ background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)" }}
        title="Phase 5 で対応予定"
        type="button"
      >
        フォローする（Coming Soon）
      </button>
    </div>
  )
}
