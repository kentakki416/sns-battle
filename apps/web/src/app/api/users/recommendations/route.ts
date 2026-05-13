import { NextResponse } from "next/server"

import { getAccessToken } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

/**
 * GET /api/users/recommendations proxy
 *
 * Server Component（ホームフィード）から呼ばれるが、Server Component は `apiClient` を直接利用する
 * のが基本。本 Route Handler は Client Component から再フェッチしたい場面（タブ切替や mutate 後の更新）
 * のために用意してある same-origin proxy。
 *
 * クエリは `limit` のみ転送。Access Token は cookie から取得して Authorization に乗せる。
 */
export const GET = async (req: Request): Promise<Response> => {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const url = new URL(req.url)
  const upstream = await fetch(
    `${API_BASE_URL}/api/users/recommendations${url.search}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      method: "GET",
    },
  )

  const body = await upstream.text()
  return new NextResponse(body, {
    headers: { "Content-Type": "application/json" },
    status: upstream.status,
  })
}
