"use client"

import { usePathname } from "next/navigation"

import Navbar from "@/components/layout/navbar"
import Sidebar from "@/components/layout/sidebar"

/**
 * サイドバーのみ非表示にするパス（ナビバーは表示）
 */
const noSidebarPaths = ["/battles"]

/**
 * ナビバー・サイドバーともに非表示（完全フルスクリーン）
 * 配信視聴、バトルルーム、マッチング、ログイン
 */
const immersivePaths = ["/sign-in", "/stream/", "/matching"]

/**
 * バトル詳細ページ（/battles/xxx）かどうか判定
 * /battles 一覧は除外する
 */
const isBattleDetailPath = (pathname: string) =>
  pathname.startsWith("/battles/") && pathname !== "/battles"

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const isImmersive = isBattleDetailPath(pathname) || immersivePaths.some((path) => {
    if (path === "/matching") return pathname === "/matching"
    return pathname.startsWith(path)
  })

  const isNoSidebar = noSidebarPaths.some((path) => pathname === path)

  const showNavbar = !isImmersive
  const showSidebar = !isImmersive && !isNoSidebar

  return (
    <>
      {showNavbar && <Navbar />}
      {showSidebar && <Sidebar />}
      <main
        className={`min-h-screen ${
          isImmersive
            ? ""
            : showSidebar
              ? "ml-60 mt-14 p-6"
              : "mt-14 p-6"
        }`}
      >
        {children}
      </main>
    </>
  )
}
