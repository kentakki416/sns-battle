# step5-api-matching-sessions.md

`GET /api/matching/sessions/:id` と `POST /api/matching/sessions/:id/end` を実装する。セッション情報の取得と手動終了。手動終了は **5 分経過後のみ可能**（5 分未満は 400）。

設計詳細は `docs/spec/matching/README.md` の [REST API](./README.md#rest-api) と [時間制限とタイマー](./README.md#時間制限とタイマー) を参照。依存: step1（DB）。

## 仕様

### GET /api/matching/sessions/:id

- 認証: Access Token 必須
- セッション参加者（user1 / user2）のみ取得可。それ以外は 403
- レスポンス: `id, user1, user2, status, started_at, ended_at, end_reason, livekit_room_name, elapsed_seconds, can_end_now (5 分経過済か), is_self_user1 (自分が user1 か)`
- `user1` / `user2` には `id, name, avatar_url` を含める

### POST /api/matching/sessions/:id/end

- 認証: Access Token 必須
- 自分が参加者でない → 403
- 既に ENDED → 410 GONE
- `started_at` から 5 分未満 → 400 BAD_REQUEST「5 分経過後に終了できます」
- 成功時: `status=ENDED`, `ended_at=now()`, `end_reason=MANUAL`
- LiveKit Data Channel `matching:ended` 配信は step8 / step9 のサーバーサイドタイマーから実施。本 step では DB 更新のみ

## 対応内容

### スキーマ定義

`packages/schema/src/api-schema/matching.ts` に追記:

```typescript
export const getMatchingSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const getMatchingSessionResponseSchema = z.object({
  can_end_now: z.boolean(),
  elapsed_seconds: z.number().int(),
  ended_at: z.string().nullable(),
  end_reason: z.enum(["TIMEOUT", "USER_LEFT", "MANUAL"]).nullable(),
  id: z.number().int(),
  is_self_user1: z.boolean(),
  livekit_room_name: z.string(),
  started_at: z.string().nullable(),
  status: z.enum(["COUNTDOWN", "ACTIVE", "ENDED"]),
  user1: z.object({
    avatar_url: z.string().nullable(),
    id: z.number().int(),
    name: z.string().nullable(),
  }),
  user2: z.object({
    avatar_url: z.string().nullable(),
    id: z.number().int(),
    name: z.string().nullable(),
  }),
})

export const endMatchingSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const endMatchingSessionResponseSchema = z.object({
  ended_at: z.string(),
  end_reason: z.enum(["TIMEOUT", "USER_LEFT", "MANUAL"]),
  id: z.number().int(),
  status: z.literal("ENDED"),
})
```

### Service

`apps/api/src/service/matching-service.ts` に追加:

```typescript
export const getMatchingSession = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository; userRepository: UserRepository }
): Promise<Result<MatchingSessionView>> => {
  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant"))
  }

  const [user1, user2] = await Promise.all([
    repo.userRepository.findById(session.user1Id),
    repo.userRepository.findById(session.user2Id),
  ])
  if (!user1 || !user2) return err(notFoundError("Participant user not found"))

  const elapsed = session.startedAt
    ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
    : 0
  const canEndNow = session.status === "ACTIVE" && elapsed >= 300
  return ok({ session, user1, user2, elapsedSeconds: elapsed, canEndNow, isSelfUser1: session.user1Id === input.userId })
}

export const endMatchingSession = async (
  input: { sessionId: number; userId: number; reason: MatchingEndReason },
  repo: { matchingSessionRepository: MatchingSessionRepository }
): Promise<Result<MatchingSession>> => {
  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant"))
  }
  if (session.status === "ENDED") return err(goneError("Already ended"))

  /** MANUAL 終了は 5 分制約 */
  if (input.reason === "MANUAL") {
    const elapsed = session.startedAt ? Math.floor((Date.now() - session.startedAt.getTime()) / 1000) : 0
    if (elapsed < 300) {
      return err(badRequestError("Cannot end session before 5 minutes"))
    }
  }

  const updated = await repo.matchingSessionRepository.markEnded(input.sessionId, input.reason)
  return ok(updated)
}
```

`endMatchingSession` の `reason` 引数で TIMEOUT / USER_LEFT / MANUAL を切り替えられるようにし、Controller からは MANUAL のみ呼ぶ。step8（タイマー）と step9（Webhook）でそれぞれ TIMEOUT / USER_LEFT として呼ぶ。

### Controller / Router / DI

`controller/matching/session-detail.ts` / `session-end.ts` を新規追加。Router に:

```typescript
router.get("/sessions/:id", ...)
router.post("/sessions/:id/end", ...)
```

## 動作確認

### Service ユニットテスト

- 参加者取得 → ok、`is_self_user1` の値が正しい
- 非参加者 → 403
- 存在しない → 404
- end: ENDED 済 → 410
- end: 5 分未満 → 400
- end: ACTIVE で 5 分以上 + MANUAL → ok、ended_at と end_reason が設定される

### Controller integration テスト

- 実 DB で MatchingSession を作成（startedAt を意図的に過去にして 5 分経過済の状態を作る）
- 200 / 403 / 404 / 410 / 400 / 401 のステータス確認
- 終了後に `matching_sessions.status='ENDED'`、`end_reason='MANUAL'`、`ended_at` が NOT NULL であることを toMatchObject で確認

### dev で疎通

```bash
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/sessions/1
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/sessions/1/end
```

## 既知の未対応 / 後続 step に持ち越し

- 終了時の Data Channel `matching:ended` 配信は step8（テーマタイマー）と step9（Webhook）で行う
- TIMEOUT 終了の自動化は step8
- USER_LEFT 終了は step9（LiveKit Webhook）
