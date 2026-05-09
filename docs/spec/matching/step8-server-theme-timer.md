# step8-server-theme-timer.md

サーバーサイドのテーマ進行ロジックを **`apps/matching-worker` の BullMQ delayed job** として実装する。`setTimeout` は使わない。`apps/api` 側からは「session 開始時に必要なジョブを queue にいれる」だけ。実際のテーマ進行 / Data Channel 配信は worker が消化する。

設計詳細は `docs/spec/matching/README.md` の [アーキテクチャ - BullMQ ジョブ設計](./README.md#bullmq-ジョブ設計) と [サーバーサイドタイマー管理](./README.md#サーバーサイドタイマー管理) を参照。

依存: step0（apps/matching-worker / packages/queue / BullMQ 導入済）、step1（DB）、step5（sessions API）、step4（LiveKit クライアント）。

## 仕様

- `POST /api/matching/sessions/:id/start`（api 側）が呼ばれた時点で worker 側のテーマ進行を起動する
- 起動時に以下のジョブを `theme-progress` queue に enqueue:
  1. `advance-theme(sessionId, nextRoundNumber=1)` を `delay=0`（即時）
  2. `publish-timer(sessionId, tickIndex=0)` を `delay=30000`（30 秒後）
  3. `session-timeout(sessionId)` を `delay=600000`（10 分後）
- 各ジョブは **冪等**（jobId が同一なら重複 enqueue されない、session ENDED なら no-op）

## 対応内容

### Redis のテーマスケジュール永続化

session の 10 ラウンド分のテーマシャッフル結果を Redis に保存。worker が再起動しても進行を再開できるよう、決定的なデータとして保持する。

```
Key: matching:schedule:{sessionId}
Type: JSON
Value: [
  { themeId: 5, durationSeconds: 30, speakerUserKey: "user1" },
  { themeId: 12, durationSeconds: 15, speakerUserKey: "user2" },
  ...
]
TTL: 1800 秒（30 分。タイムアウト + 余裕分）
```

最初の `advance-theme(nextRoundNumber=1)` ジョブ消化時に Redis に存在しなければ `buildThemeSchedule()` で生成して保存。以降のジョブは Redis から読み込み。

### `apps/api` 側

#### `POST /api/matching/sessions/:id/start` controller

```typescript
async execute(req, res) {
  const { id } = startSessionPathParamSchema.parse(req.params)
  const result = await service.matching.startSession(
    { sessionId: id, userId: req.userId! },
    { matchingSessionRepository: this.matchingSessionRepository },
    { themeProgressQueue: this.themeProgressQueue }
  )
  // ok / error 透過
}
```

#### Service: `startSession`

```typescript
export const startSession = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
  queue: { themeProgressQueue: Queue<ThemeProgressJob> }
): Promise<Result<{ sessionId: number; startedAt: Date }>> => {
  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant"))
  }
  if (session.status === "ACTIVE") return ok({ sessionId: session.id, startedAt: session.startedAt! })
  if (session.status === "ENDED") return err(goneError("Already ended"))

  /** COUNTDOWN → ACTIVE + startedAt セット */
  const updated = await repo.matchingSessionRepository.markActive(input.sessionId)

  /** 3 種類のジョブを enqueue（決定的 jobId で冪等性確保） */
  await Promise.all([
    queue.themeProgressQueue.add(
      "advance-theme",
      { type: "advance-theme", sessionId: input.sessionId, nextRoundNumber: 1 },
      { delay: 0, jobId: buildAdvanceThemeJobId(input.sessionId, 1) }
    ),
    queue.themeProgressQueue.add(
      "publish-timer",
      { type: "publish-timer", sessionId: input.sessionId, tickIndex: 0 },
      { delay: 30_000, jobId: buildPublishTimerJobId(input.sessionId, 0) }
    ),
    queue.themeProgressQueue.add(
      "session-timeout",
      { type: "session-timeout", sessionId: input.sessionId },
      { delay: 600_000, jobId: buildSessionTimeoutJobId(input.sessionId) }
    ),
  ])

  return ok({ sessionId: updated.id, startedAt: updated.startedAt! })
}
```

`MatchingSessionRepository.markActive(id)` は status を ACTIVE に更新し、`startedAt` を `now()` に設定する（既に ACTIVE / ENDED なら何もせず現在の row を返す）。

### `apps/matching-worker` 側

#### `jobs/advance-theme.ts`

```typescript
import type { AdvanceThemeJob } from "@repo/queue"
import { buildAdvanceThemeJobId } from "@repo/queue"

const HYPE_COMMENTS = [
  "本当に相手の心つかめたか？",
  "いい感じ！",
  "盛り上がってきた！",
  "次のテーマで勝負！",
  "相性バッチリかも！？",
  "ドキドキの展開！",
  "ここからが本番！",
  "運命の出会いか！？",
] as const

const TOTAL_ROUNDS = 10

export const advanceTheme = async (data: AdvanceThemeJob): Promise<void> => {
  const session = await matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") return
  if (data.nextRoundNumber > TOTAL_ROUNDS) return

  /** Redis にスケジュールがなければ生成 */
  const scheduleKey = `matching:schedule:${data.sessionId}`
  let schedule = JSON.parse((await redis.get(scheduleKey)) ?? "null")
  if (!schedule) {
    schedule = await buildThemeSchedule()
    await redis.set(scheduleKey, JSON.stringify(schedule), "EX", 1800)
  }

  const round = schedule[data.nextRoundNumber - 1]
  const theme = await talkThemeRepository.findByIdWithChoices(round.themeId)
  if (!theme) return

  /** 2 ラウンド目以降は hype を先に配信（1 ラウンド目は countdown 直後なので不要） */
  if (data.nextRoundNumber > 1) {
    const hype = HYPE_COMMENTS[Math.floor(Math.random() * HYPE_COMMENTS.length)]
    await livekitClient.publishData({
      roomName: session.livekitRoomName,
      topic: "matching:hype",
      payload: { message: hype },
    })
    /** 1.5 秒待ってから theme 配信 */
    await new Promise((r) => setTimeout(r, 1500))
  }

  /** matching:theme 配信 */
  await livekitClient.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:theme",
    payload: {
      round_number: data.nextRoundNumber,
      theme_id: theme.id,
      type: theme.type,
      title: theme.title,
      choices: theme.choices,
      speaker: round.speakerUserKey,
      duration: round.durationSeconds,
    },
  })

  /** 次ラウンドの advance-theme を enqueue */
  if (data.nextRoundNumber < TOTAL_ROUNDS) {
    await themeProgressQueue.add(
      "advance-theme",
      { type: "advance-theme", sessionId: data.sessionId, nextRoundNumber: data.nextRoundNumber + 1 },
      {
        delay: round.durationSeconds * 1000,
        jobId: buildAdvanceThemeJobId(data.sessionId, data.nextRoundNumber + 1),
      },
    )
  }
}
```

#### `jobs/publish-timer.ts`

```typescript
export const publishTimer = async (data: PublishTimerJob): Promise<void> => {
  const session = await matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED" || !session.startedAt) return

  const elapsed = Math.floor((Date.now() - session.startedAt.getTime()) / 1000)
  const remaining = Math.max(0, 600 - elapsed)
  if (remaining === 0) return  // session-timeout が処理する

  await livekitClient.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:timer",
    payload: { remaining_seconds: remaining, can_end_now: elapsed >= 300 },
  })

  /** 30 秒後に次 tick */
  await themeProgressQueue.add(
    "publish-timer",
    { type: "publish-timer", sessionId: data.sessionId, tickIndex: data.tickIndex + 1 },
    { delay: 30_000, jobId: buildPublishTimerJobId(data.sessionId, data.tickIndex + 1) },
  )
}
```

#### `jobs/session-timeout.ts`

```typescript
export const sessionTimeout = async (data: SessionTimeoutJob): Promise<void> => {
  const session = await matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") return

  await matchingSessionRepository.markEnded(data.sessionId, "TIMEOUT")

  await livekitClient.publishData({
    roomName: session.livekitRoomName,
    topic: "matching:ended",
    payload: { reason: "TIMEOUT" },
  })

  /** 残りジョブを掃除 */
  await Promise.all([
    ...Array.from({ length: 10 }, (_, i) =>
      themeProgressQueue.removeJob(buildAdvanceThemeJobId(data.sessionId, i + 1))
    ),
    ...Array.from({ length: 20 }, (_, i) =>
      themeProgressQueue.removeJob(buildPublishTimerJobId(data.sessionId, i))
    ),
  ])

  await redis.del(`matching:schedule:${data.sessionId}`)
}
```

### `buildThemeSchedule`

`apps/matching-worker/src/jobs/build-theme-schedule.ts`（新規）:

```typescript
type ScheduleEntry = {
  themeId: number
  durationSeconds: number
  speakerUserKey: "user1" | "user2"
}

export const buildThemeSchedule = async (): Promise<ScheduleEntry[]> => {
  const choiceThemes = await talkThemeRepository.findActiveByCategoryAndType("MATCHING", "CHOICE")
  const freeTalkThemes = await talkThemeRepository.findActiveByCategoryAndType("MATCHING", "FREE_TALK")

  const shuffle = <T>(arr: T[]): T[] => arr.slice().sort(() => Math.random() - 0.5)
  const c = shuffle(choiceThemes)
  const f = shuffle(freeTalkThemes)

  const result: ScheduleEntry[] = []
  for (let i = 0; i < 10; i++) {
    const theme = i % 2 === 0 ? f[i % f.length] : c[i % c.length]
    result.push({
      themeId: theme.id,
      durationSeconds: theme.duration,
      speakerUserKey: i % 2 === 0 ? "user1" : "user2",
    })
  }
  return result
}
```

## 動作確認

### Service ユニットテスト（apps/api）

`startSession` の単体テスト:

- 既に ACTIVE → idempotent で ok（queue.add が呼ばれない or 冪等）
- ENDED → 410
- 非参加者 → 403
- 正常系 → ok、`themeProgressQueue.add` が 3 回呼ばれる（mock で確認）

### Worker integration テスト（apps/matching-worker）

`apps/matching-worker/test/jobs/` に各ジョブのテストを書く:

- `advance-theme`:
  - schedule が Redis に無ければ作って保存される
  - mock LiveKitClient に正しい theme payload が渡される
  - 次ラウンドの advance-theme が再 enqueue される（mock queue で確認）
  - 10 ラウンド目で再 enqueue されない
- `publish-timer`:
  - 残り時間と can_end_now が正しく計算される
  - 次 tick が enqueue される
  - 残り 0 秒なら enqueue されない
- `session-timeout`:
  - ENDED 化 + matching:ended publish
  - 残ジョブが removeJob で削除される

実 BullMQ + 実 Redis でテストする（test 用 DB として REDIS_DB=2 を割り当て）。

### dev で疎通

```bash
# 1. apps/api と apps/matching-worker を pnpm dev で並行起動
# 2. 2 ユーザーで join → matching session 成立
# 3. クライアントから POST /sessions/:id/start
# 4. matching-worker のログ:
#    - "advance-theme processed (sessionId=1, round=1)"
#    - 30 秒後 "publish-timer processed (tickIndex=0)"
#    - 各 round の duration 秒後 "advance-theme processed (round=2)"
#    - 10 分後 "session-timeout processed"
# 5. LiveKit Cloud のダッシュボードで Room 内 Data Channel メッセージを確認
# 6. DB の matching_sessions.status='ENDED' / end_reason='TIMEOUT'
```

## 既知の未対応 / 後続 step に持ち越し

- worker のメトリクス（処理時間 / 失敗率）は Phase 5 以降の monitoring セットアップで対応
- `matching:hype` の 1.5 秒待機は worker の concurrency を消費する。負荷高では別ジョブに切り出す改善余地あり
- `removeJob` で削除できない active ジョブがあっても、次回消化時に session が ENDED で no-op するので問題ない設計
- worker が処理中に死んだ場合のジョブ復元は BullMQ の `attempts` リトライで対応（既定 3 回 / exponential backoff）
