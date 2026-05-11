"use client"

import { AnimatePresence, motion } from "framer-motion"

type Props = {
  /** 表示中の盛り上げメッセージ。null で非表示 */
  message: string | null
}

/**
 * 盛り上げコメントのオーバーレイ表示コンポーネント。
 *
 * 表示時間の制御は呼び出し側（ActiveState）に持たせ、本コンポーネントは `message` の有無で
 * 表示 / 非表示を切り替えるだけにする。これにより effect 内で setState を呼ぶ必要が無くなり、
 * lint ルール `react-hooks/set-state-in-effect` に抵触しない。
 */
export function HypeCommentOverlay({ message }: Props) {
  return (
    <AnimatePresence>
      {message && (
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="pointer-events-none absolute inset-x-0 top-24 z-20 flex justify-center"
          exit={{ opacity: 0, scale: 0.95 }}
          initial={{ opacity: 0, scale: 1.1 }}
          key={message}
          transition={{ duration: 0.3 }}
        >
          <div className="rounded-full bg-accent-pink/90 px-6 py-2 text-sm font-semibold text-white shadow-[0_0_24px_var(--color-pink-glow)]">
            🎉 {message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
