"use client"

import { motion } from "framer-motion"
import Link from "next/link"

const oauthProviders = [
  { color: "bg-white text-gray-800 hover:bg-gray-100", enabled: true, icon: "G", name: "Google" },
  { color: "bg-white/[0.03] text-text-disabled cursor-not-allowed border border-white/[0.05]", enabled: false, icon: "T", name: "TikTok" },
  { color: "bg-white/[0.03] text-text-disabled cursor-not-allowed border border-white/[0.05]", enabled: false, icon: "X", name: "X" },
  { color: "bg-white/[0.03] text-text-disabled cursor-not-allowed border border-white/[0.05]", enabled: false, icon: "I", name: "Instagram" },
]

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* 背景装飾 */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/4 top-1/4 h-[600px] w-[600px] rounded-full bg-primary/[0.06] blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 h-[500px] w-[500px] rounded-full bg-cyan/[0.04] blur-[150px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[300px] rounded-full bg-accent-pink/[0.04] blur-[120px]" />
      </div>
      <div className="bg-dot-pattern pointer-events-none absolute inset-0 opacity-30" />

      <motion.div
        animate={{ opacity: 1, y: 0 }}
        className="relative w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        transition={{ duration: 0.6 }}
      >
        {/* ロゴ */}
        <div className="mb-10 text-center">
          <motion.div
            animate={{ scale: 1 }}
            className="mb-5 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-cyan text-2xl shadow-[0_0_30px_rgba(203,172,249,0.2)]"
            initial={{ scale: 0.5 }}
            transition={{ delay: 0.2, type: "spring" }}
          >
            ⚡
          </motion.div>
          <h1 className="text-3xl font-bold text-text-primary">SNS Battle</h1>
          <p className="mt-2 text-text-muted">リアルタイムで、つながる。</p>
        </div>

        {/* OAuthボタン */}
        <div className="space-y-3">
          {oauthProviders.map((provider, i) => (
            <motion.button
              key={provider.name}
              animate={{ opacity: 1, x: 0 }}
              className={`flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3.5 text-sm font-semibold transition-all ${provider.color}`}
              disabled={!provider.enabled}
              initial={{ opacity: 0, x: -20 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              type="button"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-current/30 text-xs font-bold">
                {provider.icon}
              </span>
              {provider.enabled
                ? `${provider.name} でサインイン`
                : `${provider.name} でサインイン（準備中）`
              }
            </motion.button>
          ))}
        </div>

        {/* フッター */}
        <p className="mt-8 text-center text-xs text-text-disabled">
          サインインすることで、
          <Link className="text-primary hover:underline" href="#">利用規約</Link>
          と
          <Link className="text-primary hover:underline" href="#">プライバシーポリシー</Link>
          に同意したものとみなされます。
        </p>
      </motion.div>
    </div>
  )
}
