"use client"

import { motion } from "framer-motion"

const FEATURES = [
  { emoji: "🎥", label: "ライブ配信" },
  { emoji: "🤝", label: "マッチング" },
  { emoji: "⚔️", label: "バトル" },
]

export function BrandPanel() {
  return (
    <div className="hidden flex-1 flex-col gap-8 lg:flex">
      <motion.div
        animate={{ rotate: [0, 5, -5, 0], scale: 1 }}
        className="flex h-20 w-20 items-center justify-center rounded-3xl text-3xl"
        initial={{ scale: 0 }}
        style={{
          background: "linear-gradient(135deg, rgba(203,172,249,0.3), rgba(14,165,233,0.3))",
          boxShadow: "0 0 40px rgba(203,172,249,0.15), 0 0 80px rgba(14,165,233,0.1)",
        }}
        transition={{
          rotate: { duration: 4, ease: "easeInOut", repeat: Infinity },
          scale: { stiffness: 200, type: "spring" },
        }}
      >
        ⚡
      </motion.div>

      <h1 className="text-5xl font-bold leading-tight">
        SNS
        <span className="bg-gradient-to-r from-primary via-cyan to-accent-pink bg-clip-text text-transparent">
          {" "}Battle
        </span>
      </h1>

      <p className="text-lg leading-relaxed text-text-muted">
        リアルタイムで、つながる。
        <br />
        ライブ配信、1対1マッチング、バトル。
        <br />
        新しい出会いが、ここから始まる。
      </p>

      <div className="flex flex-wrap gap-3">
        {FEATURES.map((f, i) => (
          <motion.span
            key={f.label}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-full border border-dark-border bg-dark-surface/50 px-4 py-2 text-sm text-text-secondary backdrop-blur"
            initial={{ opacity: 0, y: 10 }}
            transition={{ delay: 0.8 + i * 0.15 }}
          >
            {f.emoji} {f.label}
          </motion.span>
        ))}
      </div>
    </div>
  )
}
