import type { ReactNode } from "react"

/**
 * /sign-in 配下では Navbar / Sidebar を出さない immersive 領域
 * 現状 app/layout.tsx には共通 UI が無いため pass-through だが、
 * Phase 2 で AppShell を作る際に sign-in を除外できるよう領域を明示する
 */
export default function SignInLayout({ children }: { children: ReactNode }) {
  return <>{children}</>
}
