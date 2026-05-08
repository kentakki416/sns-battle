# step4-api-matching-token.md

`POST /api/matching/token` を実装する。LiveKit Room `matching:{sessionId}` への接続トークンを発行する。両ユーザーに `canPublish + canSubscribe + canPublishData` を付与。

設計詳細は `docs/spec/matching/README.md` の [REST API](./README.md#rest-api) を参照。依存: step1（DB）、step2（session 作成）。

## 仕様

- 認証: Access Token 必須
- リクエストボディ: `{ "session_id": number }`
- セッションが ACTIVE / COUNTDOWN かつ `req.userId` が user1 / user2 のどちらかであることを検証 → でなければ 403
- 既に ENDED なら 410 GONE
- 発行されるトークンの参加者 ID（identity）= `user:{userId}`
- ルーム名: `matching:{sessionId}`（DB の `livekit_room_name` と一致）
- 有効期限: 1 時間（ttl=3600）

## 対応内容

### LiveKit SDK 導入

```bash
cd apps/api && pnpm add livekit-server-sdk
```

### 環境変数

`apps/api/.env.local` に追加（dotenvx で暗号化）:

```bash
npx dotenvx set LIVEKIT_HOST "https://<your-project>.livekit.cloud" -f apps/api/.env.local
npx dotenvx set LIVEKIT_API_KEY "<api-key>" -f apps/api/.env.local
npx dotenvx set LIVEKIT_API_SECRET "<api-secret>" -f apps/api/.env.local
```

ルートから実行（`apps/api` ディレクトリへの cd は禁止）。

### LiveKit Client Wrapper

`apps/api/src/client/livekit.ts`（新規）。SDK の薄いラッパーにする。テスト時は interface でモック化可能にする。

```typescript
import { AccessToken, type VideoGrant } from "livekit-server-sdk"

export interface ILiveKitClient {
  /** ルーム接続用 JWT を発行 */
  generateRoomToken(input: { roomName: string; identity: string; metadata?: string; grant?: Partial<VideoGrant>; ttlSeconds?: number }): Promise<string>
}

export class LiveKitClient implements ILiveKitClient {
  constructor(
    private readonly apiKey: string,
    private readonly apiSecret: string,
  ) {}

  async generateRoomToken(input: { roomName: string; identity: string; metadata?: string; grant?: Partial<VideoGrant>; ttlSeconds?: number }): Promise<string> {
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      metadata: input.metadata,
      ttl: input.ttlSeconds ?? 3600,
    })
    at.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: input.roomName,
      roomJoin: true,
      ...input.grant,
    })
    return at.toJwt()
  }
}
```

### スキーマ定義（`packages/schema/src/api-schema/matching.ts` に追記）

```typescript
export const issueMatchingTokenRequestSchema = z.object({
  session_id: z.number().int().positive(),
})

export const issueMatchingTokenResponseSchema = z.object({
  /** LiveKit Room 接続トークン */
  token: z.string(),
  livekit_url: z.string(),
  room_name: z.string(),
  expires_at: z.number().int(),
})

export type IssueMatchingTokenRequest = z.infer<typeof issueMatchingTokenRequestSchema>
export type IssueMatchingTokenResponse = z.infer<typeof issueMatchingTokenResponseSchema>
```

### Service: `issueMatchingToken`

`apps/api/src/service/matching-service.ts` に追加。

```typescript
export const issueMatchingToken = async (
  input: { sessionId: number; userId: number },
  repo: { matchingSessionRepository: MatchingSessionRepository },
  client: { livekitClient: ILiveKitClient; livekitUrl: string },
): Promise<Result<{ token: string; livekitUrl: string; roomName: string; expiresAt: number }>> => {
  const session = await repo.matchingSessionRepository.findById(input.sessionId)
  if (!session) return err(notFoundError("Session not found"))
  if (session.status === "ENDED") return err({ statusCode: 410, type: "CONFLICT", message: "Session already ended" })
  if (session.user1Id !== input.userId && session.user2Id !== input.userId) {
    return err(forbiddenError("Not a participant of this session"))
  }

  const ttl = 3600
  const token = await client.livekitClient.generateRoomToken({
    identity: `user:${input.userId}`,
    roomName: session.livekitRoomName,
    ttlSeconds: ttl,
  })
  return ok({
    expiresAt: Math.floor(Date.now() / 1000) + ttl,
    livekitUrl: client.livekitUrl,
    roomName: session.livekitRoomName,
    token,
  })
}
```

`Result<T>` の `ApiError` に GONE が無いため、410 用のヘルパー `goneError` を `apps/api/src/types/result.ts` に追加（`type: "GONE"` を `ApiErrorType` に追加）。

### Controller / Router

`apps/api/src/controller/matching/token.ts`（新規）。Router に `POST /token` を追加。

### DI

`index.ts` で:

```typescript
const livekitClient = new LiveKitClient(
  process.env.LIVEKIT_API_KEY!,
  process.env.LIVEKIT_API_SECRET!,
)
const livekitUrl = process.env.LIVEKIT_HOST!
```

## 動作確認

### Service ユニットテスト

- mock LiveKitClient を `jest.fn()` で作成し、`generateRoomToken` が期待どおりの引数で呼ばれることを確認
- セッション参加者でない user → 403
- ENDED セッション → 410
- 存在しない session → 404
- 正常系 → ok 値の token / roomName / livekitUrl / expiresAt 検証

### Controller integration テスト

- 実 DB で MatchingSession を作成、参加者として token 取得 → 200 + token プロパティ存在
- 別ユーザーで取得 → 403
- ENDED 後に取得 → 410
- 認証なし → 401

LiveKit SDK の `AccessToken` 自体はモックせず実発行で OK（環境変数のダミー値で署名する）。テスト用の env 値は `apps/api/test/setup` 等で設定するか、dotenvx の test 用 .env を使う。

### dev で疎通

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"session_id":1}' http://localhost:8080/api/matching/token
```

返却された `token` を [LiveKit JWT decoder](https://jwt.io/) で確認し、`video.room=matching:1`、`video.canPublish=true` 等が含まれていること。

## 既知の未対応 / 後続 step に持ち越し

- LiveKit Cloud のセットアップ手順は別ドキュメント（`docs/spec/common/README.md` または `infra/terraform/`）に記載。本 step では `LIVEKIT_HOST` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` が設定済みであることを前提とする
- Webhook 受信エンドポイント（`participant_left` / `room_finished`）は step9 で実装
