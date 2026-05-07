"use client"

import { MatchingCta } from "./_navbar/MatchingCta"
import { NavbarAvatar } from "./_navbar/NavbarAvatar"
import { NavbarLogo } from "./_navbar/NavbarLogo"
import { NavbarSearch } from "./_navbar/NavbarSearch"
import { NotificationBell } from "./_navbar/NotificationBell"

export function Navbar() {
  return (
    <header
      className="fixed left-0 right-0 top-0 z-50 flex h-14 items-center justify-between px-5"
      style={{
        backdropFilter: "blur(16px) saturate(180%)",
        background: "rgba(17, 25, 40, 0.75)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <NavbarLogo />
      <NavbarSearch />
      <div className="flex items-center gap-3">
        <MatchingCta />
        <NotificationBell unreadCount={3} />
        <NavbarAvatar />
      </div>
    </header>
  )
}
