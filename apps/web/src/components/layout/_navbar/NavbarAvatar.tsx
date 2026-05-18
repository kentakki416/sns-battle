"use client"

import Link from "next/link"
import { useEffect, useRef, useState } from "react"

import { logoutAction } from "@/libs/auth-actions"

export function NavbarAvatar() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    /**
     * 外側クリックと Escape でドロップダウンを閉じる
     */
    const onPointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", onPointerDown)
    document.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("mousedown", onPointerDown)
      document.removeEventListener("keydown", onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="アカウントメニュー"
        className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white transition hover:shadow-[0_0_16px_rgba(203,172,249,0.5)]"
        onClick={() => setOpen(v => !v)}
        style={{
          background: "linear-gradient(135deg, #CBACF9 0%, #EC4899 100%)",
        }}
        type="button"
      >
        K
      </button>

      {open && (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-48 overflow-hidden rounded-xl border border-white/[0.08] shadow-[0_20px_50px_rgba(0,0,0,0.45)]"
          role="menu"
          style={{
            backdropFilter: "blur(16px) saturate(180%)",
            background: "rgba(17, 25, 40, 0.92)",
          }}
        >
          <Link
            className="block px-4 py-3 text-sm text-white transition hover:bg-white/[0.06]"
            href="/profile/me"
            onClick={() => setOpen(false)}
            role="menuitem"
          >
            プロフィール
          </Link>
          <div className="h-px bg-white/[0.06]" />
          <form action={logoutAction}>
            <button
              className="block w-full px-4 py-3 text-left text-sm text-text-secondary transition hover:bg-white/[0.06] hover:text-white"
              role="menuitem"
              type="submit"
            >
              ログアウト
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
