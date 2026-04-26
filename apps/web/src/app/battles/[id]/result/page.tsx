"use client"

import { motion } from "framer-motion"
import Link from "next/link"

import { mockBattles } from "@/libs/mock-data"

export default function BattleResultPage() {
  const battle = mockBattles[0]
  const hostWon = battle.hostStamps > battle.opponentStamps

  return (
    <div className="relative flex items-center justify-center py-16">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.04] blur-[150px]" />
        <div className="absolute right-1/3 bottom-1/4 h-[400px] w-[400px] rounded-full bg-accent-pink/[0.04] blur-[120px]" />
      </div>

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-lg text-center"
        initial={{ opacity: 0, y: 30 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="mb-2 text-3xl font-bold text-text-primary">バトル結果</h1>
        <p className="mb-10 text-sm text-text-muted">おつかれさまでした！</p>

        {/* VS 表示 */}
        <div className="mb-10 flex items-center justify-center gap-8">
          {/* ホスト */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col items-center ${hostWon ? "" : "opacity-40"}`}
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: 0.3 }}
          >
            {hostWon && (
              <motion.span
                animate={{ rotate: 0, scale: 1 }}
                className="mb-3 text-5xl"
                initial={{ rotate: -30, scale: 0 }}
                transition={{ delay: 0.6, type: "spring" }}
              >
                👑
              </motion.span>
            )}
            <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${
              hostWon ? "glow-border-purple bg-gradient-to-br from-primary/20 to-primary/5" : "bg-white/[0.03]"
            }`}>
              {battle.hostAvatar}
            </span>
            <span className="mt-3 text-sm font-semibold text-text-primary">{battle.hostName}</span>
            <span className={`text-3xl font-bold ${hostWon ? "text-primary" : "text-text-disabled"}`}>
              {battle.hostStamps}
            </span>
            {hostWon && (
              <span className="mt-1.5 rounded-md bg-primary-glow px-3 py-1 text-xs font-bold text-primary"
                style={{ border: "1px solid rgba(203,172,249,0.3)" }}
              >
                WINNER
              </span>
            )}
          </motion.div>

          <span className="text-xl font-bold text-text-disabled">VS</span>

          {/* 対戦者 */}
          <motion.div
            animate={{ opacity: 1, scale: 1 }}
            className={`flex flex-col items-center ${!hostWon ? "" : "opacity-40"}`}
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{ delay: 0.5 }}
          >
            {!hostWon && (
              <motion.span
                animate={{ rotate: 0, scale: 1 }}
                className="mb-3 text-5xl"
                initial={{ rotate: 30, scale: 0 }}
                transition={{ delay: 0.6, type: "spring" }}
              >
                👑
              </motion.span>
            )}
            <span className={`flex h-20 w-20 items-center justify-center rounded-2xl text-4xl ${
              !hostWon ? "glow-border-pink bg-gradient-to-br from-accent-pink/20 to-accent-pink/5" : "bg-white/[0.03]"
            }`}>
              {battle.opponentAvatar}
            </span>
            <span className="mt-3 text-sm font-semibold text-text-primary">{battle.opponentName}</span>
            <span className={`text-3xl font-bold ${!hostWon ? "text-accent-pink" : "text-text-disabled"}`}>
              {battle.opponentStamps}
            </span>
            {!hostWon && (
              <span className="mt-1.5 rounded-md bg-pink-glow px-3 py-1 text-xs font-bold text-accent-pink"
                style={{ border: "1px solid rgba(236,72,153,0.3)" }}
              >
                WINNER
              </span>
            )}
          </motion.div>
        </div>

        {/* 統計 */}
        <motion.div
          animate={{ opacity: 1 }}
          className="glass-card mb-8 rounded-2xl p-5"
          initial={{ opacity: 0 }}
          transition={{ delay: 0.7 }}
        >
          <div className="flex justify-center gap-10 text-sm text-text-muted">
            <span>👁 観客数: {battle.spectators}人</span>
            <span>⏱ バトル時間: 10:00</span>
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
          <Link
            className="rounded-xl bg-gradient-to-r from-primary to-cyan px-6 py-3 text-sm font-semibold text-dark-base transition-opacity hover:opacity-90"
            href="/battles"
          >
            もう一度バトル
          </Link>
        </div>
      </motion.div>
    </div>
  )
}
