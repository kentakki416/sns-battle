"use client"

import confetti from "canvas-confetti"
import { useEffect } from "react"

const COLORS: ReadonlyArray<string> = [
  "#CBACF9",
  "#EC4899",
  "#FBBF24",
  "#0EA5E9",
]

type Props = {
  /**
   * トリガーが変化したタイミングで紙吹雪を再発火する。
   * 例: バトル勝者が確定したフレームの timestamp や勝者の userId 等。
   */
  trigger: number | string
}

export function ConfettiEffect({ trigger }: Props) {
  useEffect(() => {
    const duration = 3000
    const end = Date.now() + duration

    const tick = () => {
      confetti({
        colors: [...COLORS],
        origin: { x: Math.random(), y: 0 },
        particleCount: 100,
        spread: 70,
        startVelocity: 45,
      })
      if (Date.now() < end) {
        window.setTimeout(tick, 250)
      }
    }

    tick()
  }, [trigger])

  return null
}
