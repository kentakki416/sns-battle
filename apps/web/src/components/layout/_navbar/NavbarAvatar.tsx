"use client"

import Link from "next/link"

export function NavbarAvatar() {
  return (
    <Link
      aria-label="プロフィール"
      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition hover:shadow-[0_0_16px_rgba(203,172,249,0.5)]"
      href="/profile/me"
      style={{
        background: "linear-gradient(135deg, #CBACF9 0%, #EC4899 100%)",
      }}
    >
      K
    </Link>
  )
}
