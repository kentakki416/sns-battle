type Props = {
  message: string
  phase: string
}

/**
 * Phase 8 / 9 のテーブル未投入セクションで使う「準備中」プレースホルダ。
 * 該当機能が実装されると差し替えられる前提なので、内容は最小限。
 */
export function HomeComingSoonCard({ message, phase }: Props) {
  return (
    <div className="glass-card flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center">
      <p className="text-sm text-text-muted">{message}</p>
      <p className="text-xs text-text-disabled">{phase}</p>
    </div>
  )
}
