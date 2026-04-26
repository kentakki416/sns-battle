"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

import { mockThemes } from "@/libs/mock-data"

type MatchingState = "waiting" | "matched" | "countdown" | "active"

/**
 * カウントダウン表示シーケンス（1秒ずつ）
 */
const COUNTDOWN_SEQUENCE = ["3", "2", "1", "START!"]

export default function MatchingPage() {
  const [state, setState] = useState<MatchingState>("waiting")
  const [waitTime, setWaitTime] = useState(0)
  const [countdownIndex, setCountdownIndex] = useState(0)
  const [currentThemeIndex, setCurrentThemeIndex] = useState(0)
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null)
  const [remainingTime, setRemainingTime] = useState(600)

  const currentTheme = mockThemes[currentThemeIndex]
  const countdownDisplay = COUNTDOWN_SEQUENCE[countdownIndex] ?? ""

  useEffect(() => {
    if (state !== "waiting") return
    const timer = setInterval(() => setWaitTime((t) => t + 1), 1000)
    return () => clearInterval(timer)
  }, [state])

  /**
   * デモ用: 5秒後にマッチング成立
   */
  useEffect(() => {
    if (state !== "waiting") return
    const timeout = setTimeout(() => setState("matched"), 5000)
    return () => clearTimeout(timeout)
  }, [state])

  /**
   * マッチング成立 → 2秒後にカウントダウン開始
   */
  useEffect(() => {
    if (state !== "matched") return
    const timeout = setTimeout(() => {
      setCountdownIndex(0)
      setState("countdown")
    }, 2000)
    return () => clearTimeout(timeout)
  }, [state])

  /**
   * カウントダウン: 配列を1秒ずつ進め、末尾の次で active に遷移
   */
  useEffect(() => {
    if (state !== "countdown") return
    const timeout = setTimeout(() => {
      setCountdownIndex((prev) => {
        const next = prev + 1
        if (next >= COUNTDOWN_SEQUENCE.length) {
          setState("active")
        }
        return next
      })
    }, 1000)
    return () => clearTimeout(timeout)
  }, [state, countdownIndex])

  useEffect(() => {
    if (state !== "active") return
    const timer = setInterval(() => setRemainingTime((t) => Math.max(0, t - 1)), 1000)
    return () => clearInterval(timer)
  }, [state])

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, "0")}`
  }

  const timerPercent = (remainingTime / 600) * 100
  const timerGradient = remainingTime <= 30
    ? "from-error to-error"
    : remainingTime <= 120
      ? "from-warning to-warning"
      : "from-primary via-cyan to-primary"

  return (
    <div className="relative flex h-screen items-center justify-center p-4">
      {/* 背景装飾 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute left-1/3 top-1/4 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-[150px]" />
        <div className="absolute right-1/3 bottom-1/4 h-[500px] w-[500px] rounded-full bg-cyan/[0.04] blur-[150px]" />
      </div>

      <AnimatePresence mode="wait">
        {/* 待機中 */}
        {state === "waiting" && (
          <motion.div
            key="waiting"
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div
              animate={{ scale: [1, 1.15, 1] }}
              className="mb-8 flex h-36 w-36 items-center justify-center rounded-full"
              style={{
                background: "radial-gradient(circle, rgba(203,172,249,0.15) 0%, rgba(14,165,233,0.08) 50%, transparent 70%)",
              }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <div className="flex h-28 w-28 items-center justify-center rounded-full"
                style={{ background: "radial-gradient(circle, rgba(203,172,249,0.2) 0%, rgba(14,165,233,0.1) 70%)" }}
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan text-4xl shadow-[0_0_30px_rgba(203,172,249,0.3)]">
                  🤝
                </div>
              </div>
            </motion.div>
            <h2 className="mb-2 text-xl font-bold text-text-primary">マッチング中...</h2>
            <p className="mb-8 text-sm text-text-muted">
              待機時間: {formatTime(waitTime)}
            </p>
            <button
              className="rounded-xl border border-white/[0.08] px-8 py-2.5 text-sm text-text-muted transition-all hover:bg-white/[0.03] hover:text-text-primary"
              type="button"
            >
              キャンセル
            </button>
          </motion.div>
        )}

        {/* マッチング成立 */}
        {state === "matched" && (
          <motion.div
            key="matched"
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0, scale: 0.8 }}
            transition={{ type: "spring" }}
          >
            <h2 className="mb-8 bg-gradient-to-r from-primary via-cyan to-primary bg-clip-text text-3xl font-bold text-transparent">
              マッチング成立!
            </h2>
            <div className="flex items-center gap-8">
              <motion.div animate={{ x: 0 }} className="flex flex-col items-center" initial={{ x: -60 }}>
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 text-4xl glow-border-purple">
                  🧑
                </span>
                <span className="mt-3 text-sm font-semibold text-text-primary">あなた</span>
              </motion.div>

              <motion.span
                animate={{ rotate: 0, scale: 1 }}
                className="text-4xl"
                initial={{ rotate: -180, scale: 0 }}
                transition={{ delay: 0.3, type: "spring" }}
              >
                ⚡
              </motion.span>

              <motion.div animate={{ x: 0 }} className="flex flex-col items-center" initial={{ x: 60 }}>
                <span className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan/20 to-cyan/5 text-4xl glow-border-cyan">
                  🎸
                </span>
                <span className="mt-3 text-sm font-semibold text-text-primary">ギターマスター</span>
              </motion.div>
            </div>
          </motion.div>
        )}

        {/* カウントダウン */}
        {state === "countdown" && (
          <motion.div key="countdown" className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ background: "rgba(0,3,25,0.92)", backdropFilter: "blur(12px)" }}
          >
            <AnimatePresence mode="wait">
              <motion.span
                key={countdownIndex}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-gradient-to-r from-primary via-cyan to-primary bg-clip-text text-[140px] font-bold text-transparent"
                exit={{ opacity: 0, scale: 1.5 }}
                initial={{ opacity: 0, scale: 0.3 }}
                style={{ filter: "drop-shadow(0 0 60px rgba(203,172,249,0.4))" }}
                transition={{ duration: 0.3 }}
              >
                {countdownDisplay}
              </motion.span>
            </AnimatePresence>
          </motion.div>
        )}

        {/* 通話中 */}
        {state === "active" && (
          <motion.div
            key="active"
            animate={{ opacity: 1 }}
            className="flex h-full w-full flex-col"
            initial={{ opacity: 0 }}
          >
            {/* タイマーバー */}
            <div className="mb-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.03]">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${timerGradient} transition-all duration-1000 ${remainingTime <= 30 ? "animate-pulse" : ""}`}
                style={{ width: `${timerPercent}%` }}
              />
            </div>
            <div className="mb-4 text-center text-sm text-text-muted">
              残り {formatTime(remainingTime)}
            </div>

            {/* ビデオエリア */}
            <div className="flex flex-1 gap-4">
              <div className="glow-border-cyan relative flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-cyan-900/20 to-blue-900/15"
                style={{ border: "1px solid rgba(14,165,233,0.15)" }}
              >
                <div className="absolute inset-0 flex items-center justify-center text-7xl opacity-10">🎸</div>
                <div className="absolute inset-0 bg-gradient-to-t from-dark-base/40 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-lg px-2.5 py-1 text-sm font-medium text-text-primary"
                  style={{ background: "rgba(0,3,25,0.6)", backdropFilter: "blur(8px)" }}
                >
                  ギターマスター
                </div>
              </div>
              <div className="glow-border-purple relative flex-1 overflow-hidden rounded-2xl bg-gradient-to-br from-purple-900/20 to-indigo-900/15"
                style={{ border: "1px solid rgba(203,172,249,0.15)" }}
              >
                <div className="absolute inset-0 flex items-center justify-center text-7xl opacity-10">🧑</div>
                <div className="absolute inset-0 bg-gradient-to-t from-dark-base/40 to-transparent" />
                <div className="absolute bottom-3 left-3 rounded-lg px-2.5 py-1 text-sm font-medium text-text-primary"
                  style={{ background: "rgba(0,3,25,0.6)", backdropFilter: "blur(8px)" }}
                >
                  あなた
                </div>
              </div>
            </div>

            {/* テーマカード */}
            {currentTheme && (
              <motion.div
                key={currentTheme.id}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 overflow-hidden rounded-xl p-[1px]"
                initial={{ opacity: 0, y: 20 }}
                style={{ background: "linear-gradient(135deg, rgba(203,172,249,0.3), rgba(14,165,233,0.3))" }}
              >
                <div className="rounded-xl px-5 py-4"
                  style={{ background: "linear-gradient(135deg, rgba(4,7,29,0.95), rgba(12,14,35,0.95))" }}
                >
                  <p className="mb-3 text-center text-sm font-bold text-text-primary">
                    {currentTheme.title}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {currentTheme.choices.map((choice) => (
                      <button
                        key={choice}
                        className={`rounded-xl px-5 py-2.5 text-sm font-medium transition-all ${
                          selectedChoice === choice
                            ? "bg-gradient-to-r from-primary to-cyan text-dark-base shadow-[0_0_20px_rgba(203,172,249,0.2)]"
                            : "border border-white/[0.08] bg-white/[0.03] text-text-muted hover:bg-white/[0.06] hover:text-text-primary"
                        }`}
                        type="button"
                        onClick={() => {
                          setSelectedChoice(choice)
                          setTimeout(() => {
                            setSelectedChoice(null)
                            setCurrentThemeIndex((i) => (i + 1) % mockThemes.length)
                          }, 3000)
                        }}
                      >
                        {choice}
                      </button>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}

            {/* コントロール */}
            <div className="mt-4 flex justify-center gap-3">
              {["🎤 ミュート", "📷 カメラ"].map((label) => (
                <button
                  key={label}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-5 py-2.5 text-sm text-text-muted transition-all hover:bg-white/[0.06] hover:text-text-primary"
                  type="button"
                >
                  {label}
                </button>
              ))}
              <button
                className="rounded-xl px-5 py-2.5 text-sm font-medium text-error transition-all"
                style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}
                type="button"
              >
                終了
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
