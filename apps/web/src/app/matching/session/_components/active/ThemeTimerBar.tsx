"use client"

type Props = {
    remainingSeconds: number
}

const TOTAL_DURATION_SECONDS = 600

/**
 * セッション全体（10 分）のタイマーバー。`publish-timer` イベントで 30 秒おきに更新される。
 *
 * - 残り時間に応じて色を変化（>5 分: cyan、>2 分: orange、それ以下: error）
 * - 残り秒は `MM:SS` 形式で右に表示
 */
export function ThemeTimerBar({ remainingSeconds }: Props) {
  const ratio = Math.max(0, Math.min(1, remainingSeconds / TOTAL_DURATION_SECONDS))
  const mins = Math.floor(remainingSeconds / 60)
  const secs = remainingSeconds % 60

  const color =
        remainingSeconds > 300
          ? "bg-cyan"
          : remainingSeconds > 120
            ? "bg-accent-orange"
            : "bg-error"

  return (
    <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-3 bg-gradient-to-b from-black/70 to-transparent px-4 py-2 text-xs">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-dark-elevated">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <span className="w-12 font-mono tabular-nums text-text-secondary">
        {mins.toString().padStart(2, "0")}:{secs.toString().padStart(2, "0")}
      </span>
    </div>
  )
}
