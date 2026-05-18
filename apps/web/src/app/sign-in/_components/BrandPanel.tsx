"use client"

import { DotLottieReact } from "@lottiefiles/dotlottie-react"
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
        animate={{ scale: 1 }}
        className="flex h-24 w-24 items-center justify-center"
        initial={{ scale: 0 }}
        transition={{ scale: { stiffness: 200, type: "spring" } }}
      >
        <DotLottieReact
          autoplay
          loop
          src="/kenttaki-bot.lottie"
          style={{ height: "100%", width: "100%" }}
        />
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
