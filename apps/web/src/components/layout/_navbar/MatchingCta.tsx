"use client"

import Link from "next/link"

export function MatchingCta() {
  return (
    <Link
      className="hidden h-9 items-center rounded-lg px-4 text-sm font-semibold text-white transition hover:animate-shimmer sm:inline-flex"
      href="/matching"
      style={{
        background:
          "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 50%, #CBACF9 100%)",
        backgroundSize: "200% 100%",
        boxShadow: "0 0 20px rgba(203,172,249,0.25)",
      }}
    >
      マッチング開始
    </Link>
  )
}
