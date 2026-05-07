"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

const SEQUENCE: ReadonlyArray<string> = ["3", "2", "1", "START!"]

type Props = {
  onComplete: () => void
}

export function CountdownOverlay({ onComplete }: Props) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (index >= SEQUENCE.length) {
      onComplete()
      return
    }
    const timer = window.setTimeout(() => setIndex((prev) => prev + 1), 1000)
    return () => window.clearTimeout(timer)
  }, [index, onComplete])

  if (index >= SEQUENCE.length) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,3,25,0.92)",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="bg-clip-text text-[140px] font-bold leading-none text-transparent"
          exit={{ opacity: 0, scale: 1.5 }}
          initial={{ opacity: 0, scale: 0.3 }}
          key={SEQUENCE[index]}
          style={{
            backgroundImage: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
            filter: "drop-shadow(0 0 60px rgba(203,172,249,0.4))",
          }}
          transition={{ duration: 0.3 }}
        >
          {SEQUENCE[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
