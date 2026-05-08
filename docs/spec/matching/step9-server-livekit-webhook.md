# step9-server-livekit-webhook.md

LiveKit Cloud からの Webhook を受信するエンドポイント `POST /api/matching/livekit-webhook` を実装する。`participant_left`（片方離脱）と `room_finished`（両者離脱 / Room 終了）でセッション終了処理を行う。

設計詳細は `docs/spec/matching/README.md` の [マッチング終了](./README.md#マッチング終了) と [注意事項](./README.md#注意事項) を参照。依存: step1（DB）、step5（endMatchingSession）、step8（scheduler.stop）。

## 仕様

- 認証: LiveKit の signature 検証（`livekit-server-sdk` の `WebhookReceiver`）。Access Token は不要（LiveKit からの呼び出し）
- middleware の認証ミドルウェアは `PUBLIC_PATHS` に追加して bypass
- 受信イベント:
  - `participant_left`: 片方が Room を抜けた → 残った側に `matching:ended` 配信 + `endMatchingSession(reason="USER_LEFT")` + `scheduler.stop`
  - `room_finished`: Room が完全に閉じた → `endMatchingSession(reason="USER_LEFT" / "TIMEOUT")` + `scheduler.stop`（既に終了済なら no-op）
- イベント名から `room.name` をパースして `sessionId` を取得（`matching:{sessionId}`）

## 対応内容

### 環境変数

step4 で設定済の `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` を再利用。Webhook signature 検証に同じシークレットを使う。

### Webhook Receiver の組み立て

LiveKit SDK の `WebhookReceiver` が signature 検証 + body デコードを提供する。

`apps/api/src/client/livekit.ts` に追加:

```typescript
import { WebhookReceiver } from "livekit-server-sdk"

export interface ILiveKitWebhookReceiver {
  /** Express の raw body と Authorization ヘッダから WebhookEvent を返す。署名不正なら null */
  receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null>
}

export class LiveKitWebhookReceiver implements ILiveKitWebhookReceiver {
  private receiver: WebhookReceiver

  constructor(apiKey: string, apiSecret: string) {
    this.receiver = new WebhookReceiver(apiKey, apiSecret)
  }

  async receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null> {
    if (!authHeader) return null
    try {
      return await this.receiver.receive(rawBody, authHeader)
    } catch {
      return null
    }
  }
}
```

### Express で raw body を取り扱う

`express.json()` middleware は body を JSON parse してしまうため、Webhook 用エンドポイントは raw body 文字列で受け取る必要がある。`express.raw({ type: "application/webhook+json" })` を該当ルートのみに適用する。

```typescript
// matching-router.ts
router.post("/livekit-webhook",
  express.raw({ type: "application/webhook+json" }),
  async (req, res) => controller.execute(req, res),
)
```

### Service: `handleLiveKitWebhook`

`apps/api/src/service/matching-webhook-service.ts`（新規）。

```typescript
export const handleLiveKitWebhook = async (
  event: WebhookEvent,
  repo: { matchingSessionRepository: MatchingSessionRepository },
  client: { livekitClient: ILiveKitClient; scheduler: MatchingScheduler }
): Promise<Result<void>> => {
  // event.event を switch
  // - "participant_left": room.name から sessionId をパース → endMatchingSession(USER_LEFT)
  //   - ただし既に ENDED 済なら no-op
  //   - 残った側がいるかは LiveKit 側がカウントしているので room_finished で確実に閉まる
  //   - matching:ended payload を Data Channel publish
  //   - scheduler.stop(sessionId)
  // - "room_finished": 上と同じだが既に処理済なら何もしない
  // - その他のイベント: 無視（ok 返却）
}
```

### Controller

`apps/api/src/controller/matching/livekit-webhook.ts`（新規）:

```typescript
async execute(req: Request, res: Response) {
  const rawBody = req.body instanceof Buffer ? req.body.toString("utf-8") : ""
  const authHeader = req.headers.authorization

  const event = await this.receiver.receive(rawBody, authHeader)
  if (!event) {
    return res.status(401).json({ error: "Invalid signature" })
  }

  const result = await service.matching.handleLiveKitWebhook(event, ..., ...)
  if (!result.ok) {
    return res.status(result.error.statusCode).json({ error: result.error.message, status_code: result.error.statusCode })
  }
  return res.status(204).end()
}
```

### 認証 middleware の bypass

`apps/api/src/const/index.ts` の `PUBLIC_PATHS` に `/api/matching/livekit-webhook` を追加（または前方一致の `/api/matching/livekit-webhook` を bypass する条件を `auth.ts` に追加）。

### LiveKit Cloud 側の設定

LiveKit Cloud のダッシュボードで Webhook URL を `https://<api-host>/api/matching/livekit-webhook` に設定する。dev でローカル検証する際は `ngrok` 等のトンネリングを使う。

## 動作確認

### Service ユニットテスト

- `participant_left` イベントを処理 → `endMatchingSession(USER_LEFT)` が呼ばれる、`scheduler.stop` も呼ばれる
- `room_finished` の処理
- 既に ENDED → no-op
- 不明なイベント → no-op
- `room.name` パース失敗（`matching:abc` 等）→ ok（無視）

### Controller integration テスト

- LiveKit SDK の `WebhookReceiver` を使った正規の signature 付き request → 204
- 不正 signature → 401
- 不明イベント → 204（DB 変化なし）

`AccessToken` を発行して signature を計算する形でテストする（実 LiveKit 不要）。

### dev で疎通

ngrok 経由で webhook URL を公開し、LiveKit Cloud から Room を作って参加者を抜けさせて participant_left を発火させる。

## 既知の未対応 / 後続 step に持ち越し

- `livekit-webhook` のリトライ耐性: LiveKit は失敗すると再送するため、本処理は idempotent でなければならない。`endMatchingSession` 側で「既に ENDED なら no-op」を確認済
- Webhook URL の公開はインフラ整備（infra/terraform）に依存。Spec1 リリースまでに `https://api.example.com/api/matching/livekit-webhook` に到達できる経路を準備
