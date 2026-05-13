import "./globals.css"

import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"

import { AppShell } from "@/components/layout/app-shell"
import { getCurrentUser } from "@/libs/current-user"

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist-sans",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  description: "リアルタイムで、つながる。配信・マッチング・バトルを楽しもう。",
  title: "SNS Battle",
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  /**
   * Sidebar の SidebarProfileCard / SidebarFollowing で current user を使うため、
   * Server Component の RootLayout で me を取得して AppShell に渡す。
   * 各ページ Server Component で再度 `getCurrentUser()` してもリクエストスコープの cache() で重複 fetch は防がれる。
   */
  const me = await getCurrentUser()
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AppShell me={me}>{children}</AppShell>
      </body>
    </html>
  )
}
