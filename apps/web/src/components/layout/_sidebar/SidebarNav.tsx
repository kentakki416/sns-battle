"use client"

import { usePathname } from "next/navigation"

import { SIDEBAR_NAV_ITEMS } from "./nav-items"
import { SidebarNavItem } from "./SidebarNavItem"

type Props = {
  collapsed: boolean
}

export function SidebarNav({ collapsed }: Props) {
  const pathname = usePathname()

  return (
    <nav className="flex flex-col gap-1 px-3">
      {SIDEBAR_NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/" && pathname.startsWith(item.href))
        return (
          <SidebarNavItem
            collapsed={collapsed}
            isActive={isActive}
            item={item}
            key={item.href}
          />
        )
      })}
    </nav>
  )
}
