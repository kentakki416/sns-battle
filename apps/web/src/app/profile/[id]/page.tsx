import { mockUsers } from "@/libs/mock-data"

export default function ProfilePage() {
  const user = mockUsers[0]

  return (
    <div className="relative mx-auto max-w-2xl">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[150px]" />
      </div>

      {/* プロフィールヘッダー */}
      <div className="glass-card relative mb-6 overflow-hidden rounded-2xl">
        {/* カバーグラデーション */}
        <div className="h-24 bg-gradient-to-r from-primary/20 via-cyan/10 to-accent-pink/20" />

        <div className="px-6 pb-6">
          <div className="-mt-10 flex items-end gap-5">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/30 to-cyan/20 text-4xl ring-4 ring-dark-base shadow-[0_0_20px_rgba(203,172,249,0.15)]">
              {user.avatar}
            </span>
            <div className="mb-1 flex-1">
              <h1 className="text-xl font-bold text-text-primary">{user.name}</h1>
              <p className="mt-0.5 text-sm text-text-muted">{user.bio}</p>
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between">
            <div className="flex gap-8 text-sm">
              <span className="text-text-primary">
                <span className="font-bold">{user.followers.toLocaleString()}</span>
                <span className="ml-1.5 text-text-muted">フォロワー</span>
              </span>
              <span className="text-text-primary">
                <span className="font-bold">{user.following.toLocaleString()}</span>
                <span className="ml-1.5 text-text-muted">フォロー中</span>
              </span>
            </div>

            <div className="flex gap-3">
              <button
                className="rounded-xl bg-gradient-to-r from-primary to-cyan px-6 py-2 text-sm font-semibold text-dark-base transition-opacity hover:opacity-90"
                type="button"
              >
                フォロー
              </button>
              <button
                className="rounded-xl border border-white/[0.08] px-3.5 py-2 text-sm text-text-muted transition-all hover:bg-white/[0.03] hover:text-text-primary"
                type="button"
              >
                •••
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ライブ配信履歴 */}
      <section className="relative mb-6">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-error/10">
            <span className="text-xs">📺</span>
          </div>
          <h2 className="text-base font-bold text-text-primary">ライブ配信履歴</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { date: "2026-04-25", title: "金曜アコースティックライブ #52", viewers: 1234 },
            { date: "2026-04-18", title: "金曜アコースティックライブ #51", viewers: 987 },
            { date: "2026-04-11", title: "金曜アコースティックライブ #50", viewers: 1456 },
            { date: "2026-04-04", title: "スペシャルゲスト回", viewers: 2345 },
          ].map((stream) => (
            <div
              key={stream.date}
              className="glass-card rounded-xl p-4 transition-all hover:translate-y-[-1px] hover:shadow-[0_4px_20px_rgba(203,172,249,0.06)]"
            >
              <p className="text-sm font-semibold text-text-primary">{stream.title}</p>
              <div className="mt-1.5 flex gap-4 text-[11px] text-text-disabled">
                <span>📅 {stream.date}</span>
                <span>👁 {stream.viewers.toLocaleString()}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* バトル戦績 */}
      <section className="relative">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-pink/10">
            <span className="text-xs">⚔️</span>
          </div>
          <h2 className="text-base font-bold text-text-primary">バトル戦績</h2>
        </div>
        <div className="glass-card rounded-xl p-5">
          <div className="flex gap-6 text-center">
            <div className="flex-1">
              <p className="text-3xl font-bold text-success">12</p>
              <p className="mt-0.5 text-[11px] font-medium text-text-muted">WIN</p>
            </div>
            <div className="flex-1">
              <p className="text-3xl font-bold text-error">5</p>
              <p className="mt-0.5 text-[11px] font-medium text-text-muted">LOSE</p>
            </div>
            <div className="flex-1">
              <p className="text-3xl font-bold text-text-disabled">2</p>
              <p className="mt-0.5 text-[11px] font-medium text-text-muted">DRAW</p>
            </div>
          </div>
          <div className="mt-4 flex h-2 overflow-hidden rounded-full">
            <div className="rounded-l-full bg-gradient-to-r from-success to-success/70" style={{ width: "63%" }} />
            <div className="bg-gradient-to-r from-error/70 to-error" style={{ width: "26%" }} />
            <div className="rounded-r-full bg-text-disabled/50" style={{ width: "11%" }} />
          </div>
        </div>
      </section>
    </div>
  )
}
