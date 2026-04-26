"use client"

import { motion } from "framer-motion"
import Link from "next/link"

import { mockMatchingRounds } from "@/libs/mock-data"

export default function MatchingResultPage() {
  const matchCount = mockMatchingRounds.filter((r) => r.isMatch).length
  const totalRounds = mockMatchingRounds.length

  return (
    <div className="relative flex items-center justify-center py-8">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.04] blur-[150px]" />
        <div className="absolute right-1/3 bottom-1/4 h-[400px] w-[400px] rounded-full bg-cyan/[0.04] blur-[120px]" />
      </div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg"
        initial={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="mb-2 text-center text-2xl font-bold text-text-primary">
          マッチング終了!
        </h1>
        <p className="mb-8 text-center text-sm text-text-muted">お疲れさまでした</p>

        {/* アバター表示 */}
        <div className="mb-8 flex items-center justify-center gap-8">
          <motion.div animate={{ x: 0 }} className="flex flex-col items-center" initial={{ x: -30 }} transition={{ delay: 0.2 }}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-3xl glow-border-purple">
              🧑
            </span>
            <span className="mt-2 text-sm font-medium text-text-primary">あなた</span>
          </motion.div>

          <motion.span
            animate={{ scale: 1 }}
            className="bg-gradient-to-r from-accent-pink to-primary bg-clip-text text-3xl text-transparent"
            initial={{ scale: 0 }}
            transition={{ delay: 0.4, type: "spring" }}
          >
            ♥
          </motion.span>

          <motion.div animate={{ x: 0 }} className="flex flex-col items-center" initial={{ x: 30 }} transition={{ delay: 0.2 }}>
            <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan/20 to-cyan/5 text-3xl glow-border-cyan">
              🎸
            </span>
            <span className="mt-2 text-sm font-medium text-text-primary">ギターマスター</span>
          </motion.div>
        </div>

        {/* 一致数 */}
        <motion.div
          animate={{ opacity: 1 }}
          className="mb-8 text-center"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.6 }}
        >
          <span className="bg-gradient-to-r from-primary to-cyan bg-clip-text text-5xl font-bold text-transparent">
            {matchCount}
          </span>
          <span className="text-xl text-text-muted"> / {totalRounds}</span>
          <p className="mt-1 text-sm text-text-muted">一致した回答</p>
        </motion.div>

        {/* ラウンド詳細 */}
        <motion.div
          animate={{ opacity: 1 }}
          className="glass-card mb-8 rounded-2xl p-4"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.8 }}
        >
          <div className="space-y-2">
            {mockMatchingRounds.map((round) => (
              <div
                key={round.round}
                className={`flex items-center gap-3 rounded-xl p-3 ${
                  round.isMatch ? "bg-primary/[0.05]" : "bg-white/[0.02]"
                }`}
                style={round.isMatch ? { border: "1px solid rgba(203,172,249,0.1)" } : {}}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-xs font-bold text-text-muted">
                  {round.round}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text-primary">{round.theme}</p>
                  <div className="mt-0.5 flex gap-3 text-[11px] text-text-muted">
                    <span>あなた: {round.myChoice}</span>
                    <span>相手: {round.peerChoice}</span>
                  </div>
                </div>
                <span className="shrink-0 text-lg">
                  {round.isMatch ? "🎉" : "✕"}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* アクション */}
        <div className="flex justify-center gap-4">
          <Link
            className="rounded-xl border border-white/[0.08] px-6 py-3 text-sm font-semibold text-text-muted transition-all hover:bg-white/[0.03] hover:text-text-primary"
            href="/"
          >
            ホームに戻る
          </Link>
          <button
            className="rounded-xl bg-gradient-to-r from-primary to-cyan px-6 py-3 text-sm font-semibold text-dark-base transition-opacity hover:opacity-90"
            type="button"
          >
            フォローする
          </button>
        </div>
      </motion.div>
    </div>
  )
}
