"use client"

import { motion } from "framer-motion"

import { startGoogleOAuth } from "../actions"

import { ProviderButton } from "./ProviderButton"
import { PROVIDERS } from "./providers"

type Props = {
  error?: string
}

const ERROR_MESSAGES: Record<string, string> = {
  auth_failed: "認証に失敗しました。もう一度お試しください。",
  invalid_request: "リクエストが不正です。",
  oauth_denied: "Google アカウントへのアクセスが拒否されました。",
  state_mismatch: "セッションが切れました。もう一度お試しください。",
}

export function SignInCard({ error }: Props) {
  const errorMessage = error ? ERROR_MESSAGES[error] ?? "エラーが発生しました。" : null

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="w-full max-w-md rounded-3xl p-[1px]"
      initial={{ opacity: 0, y: 20 }}
      style={{
        background: "linear-gradient(135deg, rgba(203,172,249,0.2), rgba(14,165,233,0.15), rgba(236,72,153,0.1))",
      }}
      transition={{ duration: 0.6 }}
    >
      <div
        className="rounded-3xl px-8 py-10"
        style={{
          backdropFilter: "blur(40px)",
          background: "linear-gradient(135deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.85) 100%)",
        }}
      >
        <div className="mb-8 hidden lg:block">
          <h2 className="text-2xl font-semibold">サインイン</h2>
          <p className="mt-1 text-sm text-text-muted">アカウントに接続して始めましょう</p>
        </div>

        {errorMessage && (
          <div className="mb-6 rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-error">
            {errorMessage}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {PROVIDERS.map((p, i) => (
            <motion.div
              key={p.id}
              animate={{ opacity: 1, x: 0 }}
              initial={{ opacity: 0, x: -20 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              {p.id === "google" ? (
                <form action={startGoogleOAuth}>
                  <ProviderButton provider={p} type="submit" />
                </form>
              ) : (
                <ProviderButton provider={p} type="button" />
              )}
            </motion.div>
          ))}
        </div>

        <div className="my-6 flex items-center gap-3">
          <div className="h-[1px] flex-1 bg-white/[0.06]" />
          <span className="text-xs text-text-disabled">その他のオプション</span>
          <div className="h-[1px] flex-1 bg-white/[0.06]" />
        </div>

        <button
          className="w-full rounded-xl border border-dashed border-white/[0.08] py-3 text-sm text-text-muted transition hover:text-white"
          type="button"
        >
          ゲストとして見学する
        </button>

        <p className="mt-6 text-xs leading-relaxed text-text-disabled">
          サインインすることで、利用規約 と プライバシーポリシー に同意したものとみなされます。
        </p>
      </div>
    </motion.div>
  )
}
