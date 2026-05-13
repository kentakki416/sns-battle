import { NextResponse } from "next/server"

import { getAccessToken } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

/**
 * GET /api/users/search proxy
 *
 * /search ページの Client Component から呼ぶ Same-Origin Route Handler。
 * - クエリパラメータ (`q` / `limit` / `cursor`) はそのまま Express に転送する
 * - Access Token は cookie から取得して Authorization ヘッダで Express に渡す
 * - Express 側の status と body を passthrough する
 */
export const GET = async (req: Request): Promise<Response> => {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const upstream = await fetch(`${API_BASE_URL}/api/users/search${url.search}`, {
    headers: { Authorization: `Bearer ${token}` },
    method: "GET",
  })

  const body = await upstream.text()
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json" },
    status: upstream.status,
  })
}
