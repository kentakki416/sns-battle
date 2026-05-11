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

// ========================================================
// POST /api/matching/token - LiveKit Room 接続トークン発行
// ========================================================

/**
 * POST /api/matching/token のリクエスト。
 * 自分が参加している MatchingSession の id を渡す。
 */
export const issueMatchingTokenRequestSchema = z.object({
  session_id: z.number().int().positive(),
})

/**
 * POST /api/matching/token のレスポンス。
 *
 * - `token`: LiveKit Room 接続用 JWT
 * - `livekit_url`: クライアントが接続する LiveKit ホスト URL
 * - `room_name`: 接続先ルーム名（DB の `livekit_room_name` と一致）
 * - `expires_at`: トークンの有効期限（unix epoch 秒）
 */
export const issueMatchingTokenResponseSchema = z.object({
  expires_at: z.number().int().positive(),
  livekit_url: z.string(),
  room_name: z.string(),
  token: z.string(),
})

// ========================================================
// GET /api/matching/sessions/:id - セッション情報取得
// ========================================================

/**
 * セッション参加者の最小公開プロフィール。
 * 一覧 / 詳細表示用に id / name / avatar のみ。
 */
export const matchingSessionParticipantSchema = z.object({
  id: z.number().int().positive(),
  avatar_url: z.string().nullable(),
  name: z.string().nullable(),
})

/**
 * MatchingSession の状態。
 *
 * - COUNTDOWN: マッチング成立直後 〜 START 直前
 * - ACTIVE: 通話中
 * - ENDED: 終了済（再接続不可）
 */
export const matchingSessionStatusSchema = z.enum(["COUNTDOWN", "ACTIVE", "ENDED"])

/**
 * セッション終了理由。
 * - TIMEOUT: テーマ進行が全ラウンド完了
 * - USER_LEFT: 片方が退出（LiveKit Webhook 由来）
 * - MANUAL: ユーザーが明示的に終了ボタンを押した
 */
export const matchingSessionEndReasonSchema = z.enum(["TIMEOUT", "USER_LEFT", "MANUAL"])

export const getMatchingSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * GET /api/matching/sessions/:id のレスポンス。
 *
 * - `elapsed_seconds`: started_at からの経過秒。COUNTDOWN（startedAt が null）なら 0
 * - `can_end_now`: ACTIVE かつ 5 分経過済のとき true。手動終了 UI の活性制御に使う
 * - `is_self_user1`: 自分が user1 か。VS レイアウトの左右割り当てに使う
 */
export const getMatchingSessionResponseSchema = z.object({
  can_end_now: z.boolean(),
  elapsed_seconds: z.number().int().nonnegative(),
  ended_at: z.string().nullable(),
  end_reason: matchingSessionEndReasonSchema.nullable(),
  id: z.number().int().positive(),
  is_self_user1: z.boolean(),
  livekit_room_name: z.string(),
  started_at: z.string().nullable(),
  status: matchingSessionStatusSchema,
  user1: matchingSessionParticipantSchema,
  user2: matchingSessionParticipantSchema,
})

// ========================================================
// POST /api/matching/sessions/:id/start - セッション開始（COUNTDOWN → ACTIVE）
// ========================================================

/**
 * POST /api/matching/sessions/:id/start の路径パラメータ。
 */
export const startMatchingSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/start のレスポンス。
 *
 * - `started_at`: ACTIVE に遷移した時刻（ISO 8601）。冪等呼び出しでも既存値を返す
 */
export const startMatchingSessionResponseSchema = z.object({
  session_id: z.number().int().positive(),
  started_at: z.string().datetime(),
})

// ========================================================
// POST /api/matching/sessions/:id/end - セッション手動終了
// ========================================================

export const endMatchingSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/end のレスポンス。
 * end_reason は本エンドポイントから呼ばれる時は常に "MANUAL" になるが、
 * Service 層は TIMEOUT / USER_LEFT も扱うため enum で表現する。
 */
export const endMatchingSessionResponseSchema = z.object({
  ended_at: z.string(),
  end_reason: matchingSessionEndReasonSchema,
  id: z.number().int().positive(),
  status: z.literal("ENDED"),
})

// ========================================================
// POST /api/matching/sessions/:id/reaction - リアクション送信
// ========================================================

/**
 * トークテーマの種類。
 * - CHOICE: 選択肢から 1 つ選んで送信
 * - FREE_TALK: 選択肢無し（matched は常に null になる）
 */
export const talkThemeTypeSchema = z.enum(["CHOICE", "FREE_TALK"])

/**
 * 単一の選択肢（自分 / 相手）。`label` は表示文字列。
 */
export const reactionChoiceSchema = z.object({
  id: z.number().int().positive(),
  label: z.string(),
})

export const submitReactionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/reaction のリクエスト。
 *
 * - `round_number` は 1〜20 の整数。step8 のテーマ進行と同期する想定
 * - `choice_id` は CHOICE テーマでは必須、FREE_TALK では null
 */
export const submitReactionRequestSchema = z.object({
  choice_id: z.number().int().positive().nullable(),
  round_number: z.number().int().min(1).max(20),
  theme_id: z.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/reaction のレスポンス。
 *
 * - `matched`: 相手が同 round 未回答なら null。両者揃えば true / false
 * - `my_choice` / `peer_choice`: CHOICE テーマで揃ったときのみ非 null
 */
export const submitReactionResponseSchema = z.object({
  matched: z.boolean().nullable(),
  my_choice: reactionChoiceSchema.nullable(),
  peer_choice: reactionChoiceSchema.nullable(),
  reaction_id: z.number().int().positive(),
})

// ========================================================
// GET /api/matching/sessions/:id/reactions - リアクション履歴取得
// ========================================================

export const getReactionsPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * 1 ラウンド分のリアクションサマリ。結果画面（step12）で使う。
 *
 * - 相手未回答（peer_choice=null）の round も含める
 * - is_match は CHOICE で両者一致したときのみ true
 */
export const reactionRoundSchema = z.object({
  is_match: z.boolean(),
  my_choice: reactionChoiceSchema.nullable(),
  peer_choice: reactionChoiceSchema.nullable(),
  round_number: z.number().int().positive(),
  theme: z.object({
    id: z.number().int().positive(),
    title: z.string(),
    type: talkThemeTypeSchema,
  }),
})

export const getReactionsResponseSchema = z.object({
  rounds: z.array(reactionRoundSchema),
})

// ========================================================
// GET /api/matching/stamps - マッチング用スタンプ一覧
// ========================================================

/**
 * スタンプアニメーション種別。LiveKit Data Channel 経由でクライアントに渡し、
 * `<StampFloatLayer>` 等の表示エフェクトを切り替える。
 */
export const stampAnimationTypeSchema = z.enum(["NONE", "FLOAT", "BOUNCE", "EXPLODE", "SHAKE"])

/**
 * マッチングセッション中に送信可能なスタンプ 1 件の最小公開情報。
 *
 * - `id`: `items.id`。スタンプ送信 API の `item_id` にそのまま渡す
 * - `is_premium`: 課金スタンプか。所持していない場合は送信 API が 403 で弾く
 */
export const matchingStampSchema = z.object({
  id: z.number().int().positive(),
  animation_type: stampAnimationTypeSchema,
  emoji: z.string(),
  is_premium: z.boolean(),
  name: z.string(),
})

/**
 * GET /api/matching/stamps のレスポンス。`is_active=true` かつ MATCHING scope を含むスタンプを
 * sortOrder 昇順で返す。クライアントの `<StampPalette>` 初期化用。
 */
export const getMatchingStampsResponseSchema = z.object({
  stamps: z.array(matchingStampSchema),
})

// ========================================================
// POST /api/matching/sessions/:id/stamp - スタンプ送信
// ========================================================

export const sendMatchingStampPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/stamp のリクエスト。
 *
 * `item_id` は `items.type='STAMP'` かつ `item_scopes` に MATCHING を含むアクティブな item の id。
 */
export const sendMatchingStampRequestSchema = z.object({
  item_id: z.number().int().positive(),
})

/**
 * POST /api/matching/sessions/:id/stamp のレスポンス。
 *
 * - `delivered_at`: Data Channel 配信時刻（unix epoch ms）。クライアントの重複検知に使う
 * - `emoji` / `animation_type`: クライアント側で自前 UI 表示するための情報
 */
export const sendMatchingStampResponseSchema = z.object({
  animation_type: stampAnimationTypeSchema,
  delivered_at: z.number().int().positive(),
  emoji: z.string(),
  item_id: z.number().int().positive(),
})

export type MatchingPeer = z.infer<typeof matchingPeerSchema>
export type JoinMatchingResponse = z.infer<typeof joinMatchingResponseSchema>
export type LeaveMatchingResponse = z.infer<typeof leaveMatchingResponseSchema>
export type MatchingStatus = z.infer<typeof matchingStatusSchema>
export type GetMatchingStatusResponse = z.infer<typeof getMatchingStatusResponseSchema>
export type MatchedMatchingEvent = z.infer<typeof matchedMatchingEventSchema>
export type HeartbeatMatchingEvent = z.infer<typeof heartbeatMatchingEventSchema>
export type CancelledMatchingEvent = z.infer<typeof cancelledMatchingEventSchema>
export type MatchingEvent = z.infer<typeof matchingEventSchema>
export type IssueMatchingTokenRequest = z.infer<typeof issueMatchingTokenRequestSchema>
export type IssueMatchingTokenResponse = z.infer<typeof issueMatchingTokenResponseSchema>
export type MatchingSessionParticipant = z.infer<typeof matchingSessionParticipantSchema>
export type MatchingSessionStatus = z.infer<typeof matchingSessionStatusSchema>
export type MatchingSessionEndReason = z.infer<typeof matchingSessionEndReasonSchema>
export type GetMatchingSessionPathParam = z.infer<typeof getMatchingSessionPathParamSchema>
export type GetMatchingSessionResponse = z.infer<typeof getMatchingSessionResponseSchema>
export type EndMatchingSessionPathParam = z.infer<typeof endMatchingSessionPathParamSchema>
export type EndMatchingSessionResponse = z.infer<typeof endMatchingSessionResponseSchema>
export type StartMatchingSessionPathParam = z.infer<typeof startMatchingSessionPathParamSchema>
export type StartMatchingSessionResponse = z.infer<typeof startMatchingSessionResponseSchema>
export type TalkThemeType = z.infer<typeof talkThemeTypeSchema>
export type ReactionChoice = z.infer<typeof reactionChoiceSchema>
export type SubmitReactionPathParam = z.infer<typeof submitReactionPathParamSchema>
export type SubmitReactionRequest = z.infer<typeof submitReactionRequestSchema>
export type SubmitReactionResponse = z.infer<typeof submitReactionResponseSchema>
export type GetReactionsPathParam = z.infer<typeof getReactionsPathParamSchema>
export type ReactionRound = z.infer<typeof reactionRoundSchema>
export type GetReactionsResponse = z.infer<typeof getReactionsResponseSchema>
export type StampAnimationType = z.infer<typeof stampAnimationTypeSchema>
export type MatchingStamp = z.infer<typeof matchingStampSchema>
export type GetMatchingStampsResponse = z.infer<typeof getMatchingStampsResponseSchema>
export type SendMatchingStampPathParam = z.infer<typeof sendMatchingStampPathParamSchema>
export type SendMatchingStampRequest = z.infer<typeof sendMatchingStampRequestSchema>
export type SendMatchingStampResponse = z.infer<typeof sendMatchingStampResponseSchema>
