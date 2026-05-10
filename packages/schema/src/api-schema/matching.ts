import { z } from "zod"

// ========================================================
// POST /api/matching/join - マッチング待機キューに参加
// ========================================================

/**
 * マッチング相手のプロフィール情報。matched=true のときに返す。
 *
 * - `age`: 生年月日から算出（未設定なら null）
 * - `hobbies`: hobby_masters から id / name のみを抽出（並びは sortOrder 昇順）
 * - 機密情報（email, coinBalance 等）は含めない
 */
export const matchingPeerSchema = z.object({
  id: z.number().int().positive(),
  age: z.number().int().nonnegative().nullable(),
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).nullable(),
  hobbies: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
  })),
  location: z.string().nullable(),
  mbti: z.string().nullable(),
  name: z.string().nullable(),
})

/**
 * POST /api/matching/join のレスポンス。
 * matched=true のときは即時マッチング成立、false のときは Redis Sorted Set に登録された待機状態。
 */
export const joinMatchingResponseSchema = z.object({
  livekit_room_name: z.string().nullable(),
  matched: z.boolean(),
  peer: matchingPeerSchema.nullable(),
  session_id: z.number().int().positive().nullable(),
})

// ========================================================
// DELETE /api/matching/leave - 待機キューから離脱
// ========================================================

/**
 * DELETE /api/matching/leave のレスポンス。
 */
export const leaveMatchingResponseSchema = z.object({
  message: z.string(),
})

// ========================================================
// GET /api/matching/status - 自分の待機状態を取得
// ========================================================

/**
 * 自分の待機状態
 * - WAITING: Redis Sorted Set に存在する
 * - MATCHED: 進行中の MatchingSession がある
 * - NONE: いずれにも該当しない
 */
export const matchingStatusSchema = z.enum(["WAITING", "MATCHED", "NONE"])

/**
 * GET /api/matching/status のレスポンス。
 * position / waited_seconds は status=WAITING のときのみ非 null。
 */
export const getMatchingStatusResponseSchema = z.object({
  position: z.number().int().nonnegative().nullable(),
  status: matchingStatusSchema,
  waited_seconds: z.number().int().nonnegative().nullable(),
})

// ========================================================
// GET /api/matching/events - SSE イベントストリーム
// ========================================================

/**
 * マッチング成立イベント。両ユーザーの SSE 接続に publish される。
 */
export const matchedMatchingEventSchema = z.object({
  livekit_room_name: z.string(),
  peer: matchingPeerSchema,
  session_id: z.number().int().positive(),
  type: z.literal("matched"),
})

/**
 * 30 秒間隔で送られるハートビート。クライアント側でタイムアウト検知に使う。
 */
export const heartbeatMatchingEventSchema = z.object({
  ts: z.number().int(),
  type: z.literal("heartbeat"),
})

/**
 * サーバー側からのキャンセル通知（メンテナンス・タイムアウト等）。
 */
export const cancelledMatchingEventSchema = z.object({
  reason: z.string(),
  type: z.literal("cancelled"),
})

/**
 * SSE で配信される全イベントの discriminated union。
 * フロントエンドは type で分岐して処理する。
 */
export const matchingEventSchema = z.discriminatedUnion("type", [
  matchedMatchingEventSchema,
  heartbeatMatchingEventSchema,
  cancelledMatchingEventSchema,
])

export type MatchingPeer = z.infer<typeof matchingPeerSchema>
export type JoinMatchingResponse = z.infer<typeof joinMatchingResponseSchema>
export type LeaveMatchingResponse = z.infer<typeof leaveMatchingResponseSchema>
export type MatchingStatus = z.infer<typeof matchingStatusSchema>
export type GetMatchingStatusResponse = z.infer<typeof getMatchingStatusResponseSchema>
export type MatchedMatchingEvent = z.infer<typeof matchedMatchingEventSchema>
export type HeartbeatMatchingEvent = z.infer<typeof heartbeatMatchingEventSchema>
export type CancelledMatchingEvent = z.infer<typeof cancelledMatchingEventSchema>
export type MatchingEvent = z.infer<typeof matchingEventSchema>
