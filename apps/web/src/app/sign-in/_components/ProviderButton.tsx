"use client"

import type { Provider } from "./providers"

type Props = {
  provider: Provider
  type: "button" | "submit"
}

export function ProviderButton({ provider, type }: Props) {
  const disabled = !provider.enabled
  return (
    <button
      className={[
        "group flex w-full items-center gap-3 rounded-xl px-4 py-3.5 text-sm transition",
        disabled
          ? "cursor-not-allowed border border-white/[0.04] bg-white/[0.02] text-text-disabled"
          : "border border-white/10 bg-white/[0.06] text-white hover:shadow-[0_0_20px_rgba(203,172,249,0.1)]",
      ].join(" ")}
      disabled={disabled}
      type={type}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold"
        style={{ backgroundColor: provider.iconBg, color: provider.id === "google" ? "#202124" : "#FFFFFF" }}
      >
        {provider.iconLabel}
      </span>
      <span className="flex-1 text-left">
        {provider.label} でサインイン{disabled ? "（準備中）" : ""}
      </span>
      {!disabled && (
        <span className="opacity-0 transition group-hover:translate-x-1 group-hover:opacity-100">→</span>
      )}
    </button>
  )
}
