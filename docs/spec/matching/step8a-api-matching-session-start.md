# step8a-api-matching-session-start.md

`apps/api` 側に `POST /api/matching/sessions/:id/start` を追加し、テーマ進行ジョブ群を BullMQ `theme-progress` queue に enqueue するところまでを実装する。**ジョブの実消化（テーマ配信 / タイマー配信 / タイムアウト）は step8b で `apps/matching-worker` 側に実装する**。

設計詳細は `docs/spec/matching/README.md` の [アーキテクチャ - BullMQ ジョブ設計](./README.md#bullmq-ジョブ設計) と [サーバーサイドタイマー管理](./README.md#サーバーサイドタイマー管理) を参照。

依存: step0（packages/queue / BullMQ 導入済）、step1（DB）、step5（sessions API / `MatchingSessionRepository`）。

## 仕様

- 認証: 必須（`authMiddleware`）
- 参加者（`user1Id` または `user2Id`）のみ呼び出せる。それ以外は 403
- 状態遷移:
  - `COUNTDOWN` → `ACTIVE` に更新し、`startedAt` を `now()` に設定
  - 既に `ACTIVE` → 何もせず ok（idempotent）
  - 既に `ENDED` → 410 Gone
  - session が存在しない → 404
- ジョブ enqueue（決定的 jobId で重複 enqueue を防ぎ冪等性を担保）:
  1. `advance-theme(sessionId, nextRoundNumber=1)` を `delay=0`（即時）
  2. `publish-timer(sessionId, tickIndex=0)` を `delay=30000`（30 秒後）
  3. `session-timeout(sessionId)` を `delay=600000`（10 分後）
- 各 jobId は `@repo/queue` の `buildAdvanceThemeJobId` / `buildPublishTimerJobId` / `buildSessionTimeoutJobId` を使用

## 対応内容

### スキーマ

`packages/schema/src/api-schema/matching.ts` に追加:

```typescript
// ========================================================
// POST /api/matching/sessions/:id/start - セッション開始
// ========================================================

/**
 * セッション開始の路径パラメータ
 */
export const startSessionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})
export type StartSessionPathParam = z.infer<typeof startSessionPathParamSchema>

/**
 * セッション開始のレスポンススキーマ
 */
export const startSessionResponseSchema = z.object({
  session_id: z.number().int().positive(),
  started_at: z.string().datetime(),
})
export type StartSessionResponse = z.infer<typeof startSessionResponseSchema>
```

`packages/schema/src/api-schema/index.ts` から re-export し、`cd packages/schema && pnpm build` を忘れない。

### Repository: `ThemeProgressEnqueuer` 抽象化

BullMQ `Queue` の raw インスタンスを Service に渡すと Service ユニットテストで `jest.fn()` でモックできない。`apps/api/src/repository/queue/theme-progress-enqueuer.ts` を新規作成し、interface 経由で注入する:

```typescript
import type { Queue } from "bullmq"
import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
  type ThemeProgressJob,
} from "@repo/queue"

export interface ThemeProgressEnqueuer {
  enqueueSessionStart: (sessionId: number) => Promise<void>
}

export class BullMQThemeProgressEnqueuer implements ThemeProgressEnqueuer {
  constructor(private readonly queue: Queue<ThemeProgressJob>) {}

  enqueueSessionStart = async (sessionId: number): Promise<void> => {
    await Promise.all([
      this.queue.add(
        "advance-theme",
        { type: "advance-theme", sessionId, nextRoundNumber: 1 },
        { delay: 0, jobId: buildAdvanceThemeJobId(sessionId, 1) },
      ),
      this.queue.add(
        "publish-timer",
        { type: "publish-timer", sessionId, tickIndex: 0 },
        { delay: 30_000, jobId: buildPublishTimerJobId(sessionId, 0) },
      ),
      this.queue.add(
        "session-timeout",
        { type: "session-timeout", sessionId },
        { delay: 600_000, jobId: buildSessionTimeoutJobId(sessionId) },
      ),
    ])
  }
}
```

`apps/api/src/repository/queue/index.ts` でバレルエクスポート（既存ディレクトリが無ければ新規作成）。

### Repository: `MatchingSessionRepository.markActive`

既存の `apps/api/src/repository/prisma/matching-session-repository.ts` に追加:

```typescript
markActive: (id: number) => Promise<MatchingSession>
```

実装方針:

- `status='COUNTDOWN'` の row を `status='ACTIVE'` + `startedAt=now()` に更新
- 既に `ACTIVE` の row はそのまま返す（updateMany の where で `status='COUNTDOWN'` を絞り、その後 findById で最新行を取得する）
- `ENDED` の場合は呼び出し元 Service が事前判定で防ぐ前提（DB レイヤでは特別扱いしない）

### Service: `startSession`

`apps/api/src/service/matching-service.ts` に追加:

```typescript
export const startSession = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
  enqueuer: { themeProgressEnqueuer: ThemeProgressEnqueuer },
): Promise<Result<{ sessionId: number; startedAt: Date }>> => {
  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant"))
  }
  if (session.status === "ENDED") return err(goneError("Already ended"))
  if (session.status === "ACTIVE") {
    return ok({ sessionId: session.id, startedAt: session.startedAt! })
  }

  const updated = await repo.matchingSessionRepository.markActive(input.sessionId)

  /** ジョブ enqueue は冪等。markActive の後に呼ぶことで「ACTIVE 化したのに enqueue 漏れ」を防ぐ */
  await enqueuer.themeProgressEnqueuer.enqueueSessionStart(input.sessionId)

  return ok({ sessionId: updated.id, startedAt: updated.startedAt! })
}
```

`goneError` が `apps/api/src/types/result.ts` に無ければ追加（`statusCode: 410`、`type: "GONE"`）。既存 `ApiError.type` の union に `"GONE"` を加える必要あり。

### Controller

`apps/api/src/controller/matching/session-start.ts`（新規）:

```typescript
import {
  type ErrorResponse,
  startSessionPathParamSchema,
  startSessionResponseSchema,
} from "@repo/api-schema"
import type { Request, Response } from "express"

import type { MatchingSessionRepository } from "../../repository/prisma"
import type { ThemeProgressEnqueuer } from "../../repository/queue"
import { service } from "../../service"

export class MatchingSessionStartController {
  constructor(
    private readonly matchingSessionRepository: MatchingSessionRepository,
    private readonly themeProgressEnqueuer: ThemeProgressEnqueuer,
  ) {}

  execute = async (req: Request, res: Response): Promise<Response> => {
    const { id } = startSessionPathParamSchema.parse(req.params)

    const result = await service.matching.startSession(
      { sessionId: id, userId: req.userId! },
      { matchingSessionRepository: this.matchingSessionRepository },
      { themeProgressEnqueuer: this.themeProgressEnqueuer },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(
      startSessionResponseSchema.parse({
        session_id: result.value.sessionId,
        started_at: result.value.startedAt.toISOString(),
      }),
    )
  }
}
```

### Router 登録

`apps/api/src/routes/matching-router.ts` に `sessionStart?: MatchingSessionStartController` を追加し、`/sessions/:id/end` の登録ブロックの近くに追加:

```typescript
// POST /api/matching/sessions/:id/start
if (controllers.sessionStart) {
  const controller = controllers.sessionStart
  router.post("/sessions/:id/start", async (req, res) => controller.execute(req, res))
}
```

`/sessions/:id`（detail）より前に登録すること（Express は宣言順）。

### DI 配線

`apps/api/src/index.ts` で:

```typescript
import { createThemeProgressQueue } from "@repo/queue"
import { BullMQThemeProgressEnqueuer } from "./repository/queue"

const themeProgressQueue = createThemeProgressQueue(queueRedis)
const themeProgressEnqueuer = new BullMQThemeProgressEnqueuer(themeProgressQueue)
const matchingSessionStartController = new MatchingSessionStartController(
  matchingSessionRepository,
  themeProgressEnqueuer,
)
```

`matchingRouter` に `sessionStart` を渡す。`SIGTERM` などのシャットダウン時に `themeProgressQueue.close()` を呼ぶことを忘れない（既存の queue close と並べる）。

## 動作確認

### Service ユニットテスト（apps/api）

`apps/api/test/service/matching/start-session.test.ts`（新規）:

| ケース | 期待結果 |
|---|---|
| session が存在しない | `result.ok=false` / `statusCode=404` |
| 非参加者が呼び出し | `result.ok=false` / `statusCode=403` |
| 既に ENDED | `result.ok=false` / `statusCode=410` |
| 既に ACTIVE | `result.ok=true`、`markActive` が呼ばれない、`enqueueSessionStart` が呼ばれない |
| 正常系（COUNTDOWN → ACTIVE） | `result.ok=true`、`markActive` が 1 回、`enqueueSessionStart` が 1 回呼ばれる |

`MatchingSessionRepository` も `ThemeProgressEnqueuer` も `jest.fn()` で mock。

### Controller integration テスト（apps/api）

`apps/api/test/controller/matching/session-start.test.ts`（新規）:

実 Postgres + 実 BullMQ + 実 Redis を使い、`@repo/queue` の `createThemeProgressQueue` で本物の Queue を作って注入する（`BullMQThemeProgressEnqueuer` 経由）。

| ケース | 期待結果 |
|---|---|
| 未認証 | 401 |
| session が存在しない | 404 |
| 非参加者 | 403 |
| 既に ENDED | 410 |
| 正常系 | 200、レスポンス `{ session_id, started_at }`、DB の `status='ACTIVE'` / `startedAt` がセット、queue に 3 件のジョブ（`advance-theme(round=1)` / `publish-timer(tick=0)` / `session-timeout`）が同 jobId で enqueue されている |
| 同 session に 2 回 POST（再 start） | 1 回目 200、2 回目 200（idempotent）、queue 上のジョブは依然 1 セット（同 jobId で重複追加されない） |

`afterAll` で queue を `obliterate` + `close`、Redis / DB を disconnect する。

### dev で疎通

```bash
pnpm --filter api dev
pnpm --filter matching-worker dev   # step8b 完了後
# 1) 2 ユーザーで /api/matching/join → match 成立 / session が COUNTDOWN
# 2) POST /api/matching/sessions/:id/start
# 3) DB の matching_sessions.status='ACTIVE'、startedAt が NOW
# 4) BullMQ Dashboard（docs/spec/bullmq-dashboard.md 参照）で theme-progress queue に 3 件の delayed ジョブを確認
```

## 既知の未対応 / 後続 step に持ち越し

- ジョブの実消化（テーマ配信 / タイマー配信 / タイムアウト処理）は step8b で `apps/matching-worker` 側に実装する
- `markActive` を含む Service の処理は本 step では DB 更新と enqueue を逐次実行する。整合性が問題になれば後続 step で `TransactionRunner` 化する
