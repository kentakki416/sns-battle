"use client"

import { AnimatePresence, motion } from "framer-motion"

type Props = {
    /**
     * 受信済みのスタンプリスト。最新を末尾に追加する想定。
     * id は表示の React key 用にユニークである必要がある（受信時刻 + sender_id 等で組み立て）。
     */
    stamps: { emoji: string; id: string }[]
}

/**
 * 受信スタンプを画面下から上へ流す半透明レイヤー。
 *
 * - 各スタンプは 2.4 秒かけて上昇しながらフェード
 * - 表示位置は左右ランダム（id 文字列から決定的に振り分け）
 * - 親コンポーネントが古いスタンプを stamps 配列から取り除く責務を持つ
 */
export function StampFloatLayer({ stamps }: Props) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {stamps.map((s) => {
          /** 文字列 hash で 10〜90% 帯にランダム配置 */
          const hash = Array.from(s.id).reduce((acc, c) => acc + c.charCodeAt(0), 0)
          const left = 10 + (hash % 80)
          return (
            <motion.div
              animate={{ opacity: [1, 1, 0], y: -360 }}
              className="absolute bottom-24 text-4xl"
              exit={{ opacity: 0 }}
              initial={{ opacity: 0, y: 0 }}
              key={s.id}
              style={{ left: `${left}%` }}
              transition={{ duration: 2.4, ease: "easeOut" }}
            >
              {s.emoji}
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}
