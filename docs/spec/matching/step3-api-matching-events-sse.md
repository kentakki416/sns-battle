# step3-api-matching-events-sse.md

`GET /api/matching/events` を SSE（Server-Sent Events）で実装する。マッチング待機中のクライアントに `matched`（成立通知）/ `heartbeat`（30 秒間隔）/ `cancelled`（サーバー側キャンセル）をストリーム送信する。

step2 では `joinMatching` 内で同期的にマッチング成立を返したが、本 step では「join したあと SSE を張り、別ユーザーの join を契機に成立通知を受ける」非同期パターンを実現する。両方のフローを共存させる（join のレスポンスでも matched を返す + SSE でも通知する）。

設計詳細は `docs/spec/matching/README.md` の [SSE](./README.md#sseserver-sent-events) を参照。依存: step2。

## 仕様

- 認証: Access Token 必須
- レスポンスヘッダ: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`, `X-Accel-Buffering: no`（nginx対策）
- イベント形式:
  - `event: matched\ndata: {"session_id":1,"livekit_room_name":"matching:1","peer":{"id":2,"name":"...","avatar_url":"..."}}\n\n`
  - `event: heartbeat\ndata: {"ts":1700000000}\n\n`
  - `event: cancelled\ndata: {"reason":"server_shutdown"}\n\n`
- heartbeat: 30 秒間隔
- 接続中にクライアントが close したら Pub/Sub 購読解除 + Redis から離脱（join 中だった場合）
- 同一ユーザーが複数タブで購読する場合は両方に通知（Redis Pub/Sub の同一 channel を購読）

## 対応内容

### Redis Pub/Sub の構造

```
channel: matching:user:{userId}
publish payload: { type: "matched", session_id, livekit_room_name, peer: { id, name, avatar_url } }
```

`joinMatching`（step2）でマッチング成立した瞬間に **両ユーザーの channel に publish** する。同期レスポンスを受け取った join 側は冗長だが UX の保険として無視してよい（クライアントは session_id 一致で重複を判定）。

### ioredis の Subscriber 専用クライアント

`ioredis` は subscribe モードに入ると他コマンドが送れないため、subscribe 専用のクライアントインスタンスを用意する。

`apps/api/src/client/redis.ts` に `createRedisSubscriber()` を追加し、`new Redis({...同設定})` を返す（既存の publisher 兼用クライアントとは別）。

### Service: `subscribeMatchingEvents`

`apps/api/src/service/matching-service.ts` に追加。Generator パターンで SSE 用イベントを yield する。

```typescript
export type MatchingEvent =
  | { type: "matched"; sessionId: number; livekitRoomName: string; peer: { id: number; name: string | null; avatarUrl: string | null } }
  | { type: "heartbeat"; ts: number }
  | { type: "cancelled"; reason: string }

export const subscribeMatchingEvents = async function* (
  userId: number,
  signal: AbortSignal,
  repo: { redisSubscriber: Redis },
): AsyncGenerator<MatchingEvent> {
  const channel = `matching:user:${userId}`
  const queue: MatchingEvent[] = []
  const wakeup = new EventEmitter()

  const handler = (ch: string, payload: string) => {
    if (ch !== channel) return
    queue.push(JSON.parse(payload) as MatchingEvent)
    wakeup.emit("data")
  }
  await repo.redisSubscriber.subscribe(channel)
  repo.redisSubscriber.on("message", handler)

  /** 30 秒ごとに heartbeat */
  const interval = setInterval(() => {
    queue.push({ type: "heartbeat", ts: Date.now() })
    wakeup.emit("data")
  }, 30_000)

  signal.addEventListener("abort", () => {
    clearInterval(interval)
    repo.redisSubscriber.unsubscribe(channel)
    repo.redisSubscriber.off("message", handler)
    wakeup.emit("data")
  })

  try {
    while (!signal.aborted) {
      while (queue.length > 0) yield queue.shift()!
      await new Promise<void>((resolve) => wakeup.once("data", resolve))
    }
  } finally {
    clearInterval(interval)
    repo.redisSubscriber.unsubscribe(channel).catch(() => {})
    repo.redisSubscriber.off("message", handler)
  }
}
```

### Controller: `MatchingEventsController`

`apps/api/src/controller/matching/events.ts`（新規）。Express の Response に直接書き出す（`res.write`）形式。

```typescript
async execute(req: AuthRequest, res: Response) {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("Connection", "keep-alive")
  res.setHeader("X-Accel-Buffering", "no")
  res.flushHeaders?.()

  const ac = new AbortController()
  req.on("close", () => ac.abort())

  for await (const ev of service.matching.subscribeMatchingEvents(
    req.userId!,
    ac.signal,
    { redisSubscriber: this.redisSubscriber },
  )) {
    res.write(`event: ${ev.type}\n`)
    res.write(`data: ${JSON.stringify(ev)}\n\n`)
  }

  res.end()
}
```

### joinMatching 拡張

step2 の `joinMatching` でマッチング成立した直後に Redis Pub/Sub に publish する。

```typescript
if (matched) {
  const payload = JSON.stringify({ type: "matched", sessionId, livekitRoomName, peer })
  /** publisher 側のクライアント（subscribe してない方）から publish する */
  await repo.redis.publish(`matching:user:${myId}`, payload)
  await repo.redis.publish(`matching:user:${peerId}`, payload)
}
```

### Router

`matching-router.ts` に追加:

```typescript
router.get("/events", async (req, res) => controller.execute(req, res))
```

middleware は通常の auth でよい（SSE もまず JWT 検証する）。

### DI

`index.ts` で `redisSubscriber = createRedisSubscriber()` を作って `MatchingEventsController` に渡す。

## 動作確認

### Service ユニットテスト

`subscribeMatchingEvents` の generator は副作用が大きいので、本ユニットテストでは Redis のメッセージ配信を擬似的に EventEmitter で再現するよりも、Controller integration テストで実 Redis を使って検証する方針。Service ユニットでは「heartbeat が 30 秒に 1 回 yield される」「abort で generator が完了する」のみを fake timer で検証する。

### Controller integration テスト

`apps/api/test/controller/matching/events.test.ts`（新規）。

- supertest で SSE は扱いにくいため、`http.get` を直接使うか、`fetch` に AbortController を組み合わせる
- 別タブとして 2 ユーザーを join → 後者の join 直後に前者の SSE で `matched` イベントを受信できることを確認
- abort 後に Redis subscriber が解除されていることは `redisPublisher.publish` 後に何も飛んでこないことで確認

### dev で疎通

```bash
# tab1: 待機側
curl -N -H "Authorization: Bearer <tokenA>" http://localhost:8080/api/matching/events

# tab2: join
curl -X POST -H "Authorization: Bearer <tokenA>" http://localhost:8080/api/matching/join

# tab3: 別ユーザーで join → tab1 に matched イベントが流れる
curl -X POST -H "Authorization: Bearer <tokenB>" http://localhost:8080/api/matching/join
```

## 既知の未対応 / 後続 step に持ち越し

- 接続切断時の Redis キュー離脱（close ハンドラで `leaveMatching` を呼ぶ）は将来検討。現状は接続切断のみで Redis のキューエントリは残るため、別途 TTL を設けるか join 時に「古い自分のエントリを掃除」するロジックが必要
- フロー上は join → SSE 接続の順だが、SSE の `matched` 取りこぼし防止のため SSE → join の順にすべき。クライアント側（step11）でその順序を担保する
- 複数タブで同時に購読する場合の整合性は Redis Pub/Sub のブロードキャスト性に任せる（同 channel の subscriber は全員に届く）
