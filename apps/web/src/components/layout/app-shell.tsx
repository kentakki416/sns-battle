"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import {
  IMMERSIVE_PATH_PREFIXES,
  isBattleDetailPath,
  NO_SIDEBAR_PATHS,
} from "./app-shell.constants"
import { Sidebar } from "./sidebar"

type Props = {
  children: ReactNode
}

export function AppShell({ children }: Props) {
  const pathname = usePathname()

  const isImmersive =
    isBattleDetailPath(pathname) ||
    IMMERSIVE_PATH_PREFIXES.some((p) => pathname.startsWith(p))

  const isNoSidebar = NO_SIDEBAR_PATHS.includes(pathname)

  if (isImmersive) {
    return <main className="min-h-screen bg-dark-base">{children}</main>
  }

  if (isNoSidebar) {
    return (
      <>
        {/**
         * TODO(step2): <Navbar /> をここに配置
         */}
        <div className="h-14" data-slot="navbar-placeholder" />
        <main className="mt-14 p-6">{children}</main>
      </>
    )
  }

  return (
    <>
      {/**
       * TODO(step2): <Navbar /> をここに配置
       */}
      <div className="h-14" data-slot="navbar-placeholder" />
      <Sidebar />
      <main className="ml-60 mt-14 p-6 transition-all duration-300">{children}</main>
    </>
  )
}
