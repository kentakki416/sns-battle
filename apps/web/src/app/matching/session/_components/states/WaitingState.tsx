"use client"

import { motion } from "framer-motion"
import { useEffect, useState } from "react"

type Props = {
  onCancel: () => void
}

/**
 * マッチング待機中の画面。三重のパルス円 + 待機時間カウントアップ + キャンセル CTA。
 *
 * - パルス円は CSS animation で 3 段階の遅延を付けて連続的に拡大 / フェード
 * - 待機時間は client mount からの経過秒で表示（`POST /matching/join` が実行されてからの実待機時間とは
 *   厳密には一致しないが、UX 的には十分。サーバー側の `waited_seconds` を取りに行くと初回 join の
 *   タイミングと食い違うことがあるため、UI 側のシンプルな経過秒で表示する）
 */
export function WaitingState({ onCancel }: Props) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="relative flex min-h-screen flex-col items-center justify-center bg-dark-base px-6 text-center"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
    >
      {/* 三重のパルス円 */}
      <div aria-hidden className="relative mb-12 h-44 w-44">
        {[0, 0.5, 1].map((delay) => (
          <span
            className="absolute inset-0 rounded-full border border-primary/40"
            key={delay}
            style={{
              animation: `matching-pulse 2.4s ease-out ${delay}s infinite`,
            }}
          />
        ))}
        <span className="absolute inset-0 flex items-center justify-center text-5xl">
          🤝
        </span>
      </div>

      <h2 className="text-2xl font-bold text-white sm:text-3xl">マッチング相手を探しています</h2>
      <p className="mt-2 text-sm text-text-muted">
        相手が見つかるまでこのまましばらくお待ちください
      </p>

      <p className="mt-6 font-mono text-3xl text-primary tabular-nums">
        {Math.floor(seconds / 60).toString().padStart(2, "0")}:
        {(seconds % 60).toString().padStart(2, "0")}
      </p>

      <button
        className="mt-12 rounded-full border border-dark-border px-8 py-2 text-sm text-text-muted transition hover:bg-dark-elevated hover:text-white"
        onClick={onCancel}
        type="button"
      >
        キャンセル
      </button>

      <style>{`
        @keyframes matching-pulse {
          0% { transform: scale(0.7); opacity: 0.9; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `}</style>
    </motion.div>
  )
}
