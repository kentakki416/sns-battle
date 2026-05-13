import { NextResponse } from "next/server"

import { getAccessToken } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * GET /api/users/:id/following proxy
 *
 * Sidebar 等の Client Component から呼ぶ Same-Origin Route Handler。
 * - 路径パラメータ `id` と任意のクエリ (`limit` / `cursor`) を Express に転送する
 * - Access Token は cookie から取得して Authorization ヘッダで Express に渡す
 * - Express 側の status と body を passthrough する
 */
export const GET = async (req: Request, context: RouteContext): Promise<Response> => {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { id } = await context.params
  const url = new URL(req.url)
  const upstream = await fetch(
    `${API_BASE_URL}/api/users/${encodeURIComponent(id)}/following${url.search}`,
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
