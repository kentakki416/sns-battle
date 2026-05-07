"use client"

type Props = {
  /**
   * 現在の残り秒数。色変化（warning / error）の判定に使う。
   */
  remainingSec: number
  /**
   * テーマやセクションが切り替わったときに変化する識別子。
   * key として使用してアニメーションを最初からやり直す。
   */
  segmentKey: number | string
  /**
   * 1 セクションの総秒数（アニメーションの duration として使う）。
   */
  totalSec: number
}

const getGradient = (remainingSec: number): string => {
  if (remainingSec <= 5) return "linear-gradient(90deg, #EF4444 0%, #EF4444 100%)"
  if (remainingSec <= 10) return "linear-gradient(90deg, #FBBF24 0%, #FBBF24 100%)"
  return "linear-gradient(90deg, #CBACF9 0%, #0EA5E9 50%, #CBACF9 100%)"
}

export function TimerBar({ remainingSec, segmentKey, totalSec }: Props) {
  const isCritical = remainingSec <= 5

  return (
    <div className="absolute left-0 right-0 top-0 h-1 bg-white/[0.08]">
      <div
        className={["h-full", isCritical ? "animate-pulse" : ""].join(" ")}
        key={segmentKey}
        style={{
          animation: `timer-shrink ${totalSec}s linear forwards`,
          background: getGradient(remainingSec),
        }}
      />
    </div>
  )
}
