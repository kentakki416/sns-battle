"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

type Props = {
  onComplete: () => void
}

/**
 * 3 → 2 → 1 → GO! の 4 秒カウントダウン画面。完了後 `onComplete` を 1 度だけ呼ぶ。
 * Phase 2 step6 の <CountdownOverlay> が将来導入されたら差し替える前提（spec 通り）。
 */
export function CountdownState({ onComplete }: Props) {
  const [count, setCount] = useState<number>(3)

  useEffect(() => {
    if (count === 0) {
      const t = setTimeout(onComplete, 800)
      return () => clearTimeout(t)
    }
    const t = setTimeout(() => setCount((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [count, onComplete])

  const label = count === 0 ? "GO!" : String(count)

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-dark-base">
      <AnimatePresence mode="wait">
        <motion.span
          animate={{ opacity: 1, scale: 1 }}
          className="font-mono text-[10rem] font-bold text-primary [text-shadow:0_0_40px_var(--color-primary-glow)]"
          exit={{ opacity: 0, scale: 0.6 }}
          initial={{ opacity: 0, scale: 1.4 }}
          key={label}
          transition={{ duration: 0.35 }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
    </div>
  )
}
