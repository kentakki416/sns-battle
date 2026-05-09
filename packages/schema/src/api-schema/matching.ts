import { z } from "zod"

// ========================================================
// POST /api/matching/join - マッチング待機キューに参加
// ========================================================

/**
 * マッチング相手の最低限のプロフィール情報。
 * matched=true のときに返す。
 */
export const matchingPeerSchema = z.object({
  avatar_url: z.string().nullable(),
  id: z.number().int().positive(),
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

export type MatchingPeer = z.infer<typeof matchingPeerSchema>
export type JoinMatchingResponse = z.infer<typeof joinMatchingResponseSchema>
export type LeaveMatchingResponse = z.infer<typeof leaveMatchingResponseSchema>
export type MatchingStatus = z.infer<typeof matchingStatusSchema>
export type GetMatchingStatusResponse = z.infer<typeof getMatchingStatusResponseSchema>
