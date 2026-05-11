import { NextResponse } from "next/server"

import { getAccessToken } from "@/libs/auth"

const API_BASE_URL = process.env.API_URL || "http://localhost:8080"

/**
 * Browser から Express API の SSE エンドポイント `/api/matching/events` を直接購読すると CORS と
 * cookie 透過の問題が出る。本 Route Handler は Same-Origin の `/api/matching/events` を
 * 受け、Server 側で Access Token を Authorization ヘッダに付けて Express にプロキシし、
 * ReadableStream を passthrough で返却する。
 *
 * SSE は長時間オープンするため `runtime = "nodejs"`（Edge では fetch ストリームの passthrough が
 * 制限あり）に固定。タイムアウトしないようヘッダで `Cache-Control: no-store` 等も付与する。
 */
export const runtime = "nodejs"
/** Next.js 16 の動的 cache を無効化。SSE は cache してはならない */
export const dynamic = "force-dynamic"

export const GET = async (req: Request): Promise<Response> => {
  const token = await getAccessToken()
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const upstream = await fetch(`${API_BASE_URL}/api/matching/events`, {
    headers: {
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`,
    },
    method: "GET",
    /** クライアント切断時に upstream も中断するため AbortSignal を引き継ぐ */
    signal: req.signal,
  })

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "Upstream SSE error" },
      { status: upstream.status || 502 },
    )
  }

  return new Response(upstream.body, {
    headers: {
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream",
    },
  })
}
