"use client"

import Link from "next/link"

export function NavbarLogo() {
  return (
    <Link className="flex items-center gap-2.5" href="/">
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
        style={{
          background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
          boxShadow: "0 0 20px rgba(203,172,249,0.3)",
        }}
      >
        ⚡
      </span>
      <span className="text-base font-semibold tracking-tight text-white">
        SNS Battle
      </span>
    </Link>
  )
}
