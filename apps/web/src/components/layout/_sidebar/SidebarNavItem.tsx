"use client"

import Link from "next/link"

import type { SidebarNavItem as Item } from "./nav-items"

type Props = {
  collapsed: boolean
  isActive: boolean
  item: Item
}

export function SidebarNavItem({ collapsed, isActive, item }: Props) {
  const base = "flex h-10 items-center gap-3 rounded-lg text-sm transition"
  const active = "border border-primary-border bg-primary-glow text-primary"
  const inactive =
    "border border-transparent text-text-muted hover:bg-white/[0.03] hover:text-white"
  const padding = collapsed ? "justify-center px-2" : "px-3"

  return (
    <Link
      className={[base, isActive ? active : inactive, padding].join(" ")}
      href={item.href}
      title={collapsed ? item.label : undefined}
    >
      <span className="text-lg leading-none">{item.emoji}</span>
      {!collapsed && <span className="flex-1">{item.label}</span>}
    </Link>
  )
}
