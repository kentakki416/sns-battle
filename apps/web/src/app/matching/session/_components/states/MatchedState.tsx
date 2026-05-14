"use client"

import { motion } from "framer-motion"

import type { MatchingPeer } from "@repo/api-schema"

import { calculateMbtiCompatibility } from "@/libs/mbti"

type Props = {
  meMbti: string | null
  peer: MatchingPeer
}

/**
 * マッチング成立直後に 2 秒だけ表示される画面。
 * MatchingSession 側で 2 秒タイマー後に countdown 状態へ遷移する。
 *
 * 両者の MBTI が揃っていれば相性スコア（0..100）も併せて表示する。
 */
export function MatchedState({ meMbti, peer }: Props) {
  const compatibility = calculateMbtiCompatibility(meMbti, peer.mbti)

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="relative flex min-h-screen flex-col items-center justify-center bg-dark-base px-6 text-center"
      exit={{ opacity: 0, scale: 1.1 }}
      initial={{ opacity: 0, scale: 0.92 }}
      transition={{ duration: 0.35 }}
    >
      <p className="mb-2 text-sm tracking-[0.3em] text-primary">MATCH!</p>
      <h2 className="text-3xl font-bold text-white sm:text-4xl">マッチング成立</h2>
      <div className="mt-8 flex flex-col items-center gap-3">
        <div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-primary bg-dark-surface">
          {peer.avatar_url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img alt={peer.name ?? "peer"} className="h-full w-full object-cover" src={peer.avatar_url} />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl text-text-muted">
              👤
            </div>
          )}
        </div>
        <p className="text-lg font-medium text-white">{peer.name ?? "Unknown"}</p>
        {peer.mbti ? (
          <p className="text-xs tracking-widest text-text-muted">{peer.mbti}</p>
        ) : null}
      </div>

      {compatibility !== null ? (
        <div
          aria-label={`MBTI 相性スコア ${compatibility} / 100`}
          className="mt-8 flex flex-col items-center gap-1 rounded-2xl border border-primary/30 bg-primary/10 px-8 py-4"
        >
          <p className="text-xs tracking-widest text-text-muted">MBTI 相性</p>
          <p className="text-3xl font-bold text-primary">
            {compatibility}
            <span className="ml-1 text-base text-text-muted">/ 100</span>
          </p>
          <p className="text-xs text-text-muted">
            {meMbti ?? "??"} × {peer.mbti ?? "??"}
          </p>
        </div>
      ) : null}
    </motion.div>
  )
}
