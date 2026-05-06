import { NextRequest, NextResponse } from "next/server"

import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from "@/libs/auth"

const PUBLIC_PATHS = [
  "/sign-in",
  "/api/auth/callback/google",
]

/**
 * Edge ランタイムで動くため JWT 検証は行わず、Cookie の有無だけで判断する
 * （実検証は API 側で行う）
 *
 * hasRefresh だけでも入場を許可する理由:
 * Server Component 側で apiClient が 401 → refresh → 再試行する設計のため、
 * access が切れている状態で middleware で蹴ると refresh の機会が失われる。
 */
export const middleware = (req: NextRequest) => {
  const { pathname } = req.nextUrl

  if (PUBLIC_PATHS.some(p => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const hasAccess = req.cookies.has(ACCESS_TOKEN_COOKIE)
  const hasRefresh = req.cookies.has(REFRESH_TOKEN_COOKIE)

  if (!hasAccess && !hasRefresh) {
    const url = new URL("/sign-in", req.url)
    url.searchParams.set("redirect", pathname)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  /** _next, _next/static, _next/image, favicon, public 配下を除外 */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|public/).*)",
  ],
}
