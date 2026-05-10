"use client"

import { WaitingUserCard, type WaitingUser } from "./WaitingUserCard"

type Props = {
    users: WaitingUser[]
}

/**
 * 「マッチング待機中」セクション。
 *
 * - セクションヘッダ + 緑バッジで人数 + 緑パルスドット
 * - users が 0 件なら空メッセージ、1 件以上なら 2 列グリッドで `WaitingUserCard` を並べる
 */
export function WaitingUserGrid({ users }: Props) {
  return (
    <section className="mx-auto mt-2 max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-lg font-semibold text-white">マッチング待機中</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
          {users.length}
        </span>
      </div>

      {users.length === 0 ? (
        <p className="rounded-xl border border-dashed border-dark-border bg-dark-surface/40 px-4 py-10 text-center text-sm text-text-disabled">
          まだマッチング待機中のユーザーはいません
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {users.map((u, i) => (
            <WaitingUserCard index={i} key={u.id} user={u} />
          ))}
        </div>
      )}
    </section>
  )
}
