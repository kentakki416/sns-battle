"use client"

import { useEffect, useState } from "react"

import type { AuthMeResponse } from "@repo/api-schema"

import { SidebarFollowing } from "./_sidebar/SidebarFollowing"
import { SidebarNav } from "./_sidebar/SidebarNav"
import { SidebarProfileCard } from "./_sidebar/SidebarProfileCard"
import { SidebarToggle } from "./_sidebar/SidebarToggle"

const STORAGE_KEY = "sns-battle.sidebar.collapsed"

type Props = {
  me: AuthMeResponse | null
}

export function Sidebar({ me }: Props) {
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "true") {
      /**
       * SSR と CSR で初期値を揃えるため、localStorage の読み出しは mount 後にだけ行う。
       * react-hooks/set-state-in-effect は localStorage 同期の典型ケースとして許容する。
       */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCollapsed(true)
    }
  }, [])

  const toggle = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(STORAGE_KEY, String(next))
  }

  return (
    <aside
      className="fixed left-0 top-14 z-40 flex h-[calc(100vh-56px)] flex-col transition-all duration-300"
      style={{
        backdropFilter: "blur(12px)",
        background:
          "linear-gradient(180deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.9) 100%)",
        borderRight: "1px solid rgba(255,255,255,0.05)",
        width: collapsed ? 68 : 240,
      }}
    >
      <SidebarToggle collapsed={collapsed} onToggle={toggle} />
      <SidebarNav collapsed={collapsed} />
      <SidebarFollowing collapsed={collapsed} me={me} />
      <SidebarProfileCard collapsed={collapsed} me={me} />
    </aside>
  )
}
