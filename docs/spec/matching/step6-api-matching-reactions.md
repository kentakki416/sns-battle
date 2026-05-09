# step6-api-matching-reactions.md

`POST /api/matching/sessions/:id/reaction`（回答送信） と `GET /api/matching/sessions/:id/reactions`（履歴取得）を実装する。両者の回答が揃ったら一致判定を行い、Data Channel `matching:reaction_match` で配信する。

設計詳細は `docs/spec/matching/README.md` の [リアクション](./README.md#リアクション選択肢回答) を参照。依存: step1（DB）、step5（セッション API）、step8 のサーバーサイドタイマー（テーマ進行 / 現在の round_number 管理）。

## 仕様

### POST /api/matching/sessions/:id/reaction

- 認証: Access Token 必須
- リクエスト: `{ "theme_id": number, "choice_id": number | null, "round_number": number }`
- 自分が参加者でない → 403、存在しない → 404、ENDED → 410
- `(session_id, user_id, round_number)` ユニーク → 既に同 round に回答済なら 409 CONFLICT
- CHOICE テーマで `choice_id=null` → 400（仕様では未回答のまま時間切れもありうるため、明示的に POST するときは null は不可。FREE_TALK のみ null 可）
- 成功時: matching_reactions に保存
- 相手が同 round に回答済なら、両者の choice 比較結果（matched: true/false）と双方の選択肢を返却 + Data Channel `matching:reaction_match` を配信
- 相手が未回答なら matched: null を返す

### GET /api/matching/sessions/:id/reactions

- 認証: Access Token 必須
- 自分が参加者でない → 403
- 全ラウンドを `round_number` 昇順で返す。各 round に theme（id, title, type）と choices（自分・相手の選択肢ラベル）と is_match を含める
- 結果画面（step12）で使用

## 対応内容

### スキーマ定義

`packages/schema/src/api-schema/matching.ts` に追記:

```typescript
export const submitReactionPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const submitReactionRequestSchema = z.object({
  choice_id: z.number().int().positive().nullable(),
  round_number: z.number().int().min(1).max(20),
  theme_id: z.number().int().positive(),
})

export const submitReactionResponseSchema = z.object({
  /** 相手が未回答なら null、両者揃ったら true/false */
  matched: z.boolean().nullable(),
  my_choice: z.object({ id: z.number().int(), label: z.string() }).nullable(),
  peer_choice: z.object({ id: z.number().int(), label: z.string() }).nullable(),
  reaction_id: z.number().int(),
})

export const getReactionsResponseSchema = z.object({
  rounds: z.array(z.object({
    is_match: z.boolean(),
    my_choice: z.object({ id: z.number().int(), label: z.string() }).nullable(),
    peer_choice: z.object({ id: z.number().int(), label: z.string() }).nullable(),
    round_number: z.number().int(),
    theme: z.object({
      id: z.number().int(),
      title: z.string(),
      type: z.enum(["CHOICE", "FREE_TALK"]),
    }),
  })),
})
```

### LiveKit Data Channel 配信のためのクライアント拡張

`apps/api/src/client/livekit.ts` に `publishData` を追加:

```typescript
import { RoomServiceClient, DataPacket_Kind } from "livekit-server-sdk"

export interface ILiveKitClient {
  generateRoomToken(input: ...): Promise<string>
  publishData(input: { roomName: string; payload: object; topic: string }): Promise<void>
}

export class LiveKitClient implements ILiveKitClient {
  private roomService: RoomServiceClient

  constructor(host: string, apiKey: string, apiSecret: string) {
    this.roomService = new RoomServiceClient(host, apiKey, apiSecret)
  }

  async publishData(input: { roomName: string; payload: object; topic: string }) {
    const data = new TextEncoder().encode(JSON.stringify(input.payload))
    await this.roomService.sendData(input.roomName, data, DataPacket_Kind.RELIABLE, {
      topic: input.topic,
    })
  }
}
```

### Repository

`MatchingReactionRepository` に以下を追加:

- `create(input: { sessionId, userId, themeId, choiceId, roundNumber })`
- `findOpponentInSameRound(sessionId, myUserId, roundNumber)` → 相手の同 round 回答（または null）
- `findAllForSession(sessionId)` → 全 reaction を round 昇順 + theme/choice JOIN で取得

### Service

```typescript
export const submitReaction = async (
  input: { sessionId, userId, themeId, choiceId, roundNumber },
  repo: { matchingSessionRepository, matchingReactionRepository, talkThemeRepository },
  client: { livekitClient: ILiveKitClient }
): Promise<Result<{ reactionId, matched, myChoice, peerChoice }>> => {
  // セッション参加者チェック / status チェック
  // 既存 reaction （同 round, 同 user）→ 409
  // theme 取得 → CHOICE で choice_id=null → 400
  // create
  // 相手の同 round reaction を検索
  // 揃っていれば matched 判定 + Data Channel publish + my/peer choice ラベル付き返却
  // 揃ってなければ matched=null で返却
}

export const getReactions = async (
  input: { sessionId, userId },
  repo: ...
): Promise<Result<ReactionRoundsView>> => {
  // 参加者チェック
  // 全 reaction を取得 → round_number でグルーピング
  // 各 round で my/peer の choice + is_match を計算して返却
}
```

Data Channel payload 例:

```json
{
  "topic": "matching:reaction_match",
  "payload": {
    "round_number": 2,
    "theme_id": 5,
    "matched": true,
    "user1_choice_id": 12,
    "user2_choice_id": 12
  }
}
```

### Controller / Router / DI

```typescript
router.post("/sessions/:id/reaction", ...)
router.get("/sessions/:id/reactions", ...)
```

## 動作確認

### Service ユニットテスト

- 自分が先に回答 → matched: null が返る、Data Channel publish されない
- 相手が後から回答 → matched: true/false、Data Channel publish される（mock LiveKitClient で受信引数確認）
- 同 round 同 user で再 POST → 409
- CHOICE テーマで choice_id=null → 400
- FREE_TALK テーマで choice_id=null → ok（ただし matched は常に null）
- 非参加者 → 403
- ENDED セッション → 410

### Controller integration テスト

- 実 DB で reaction を作成 → 200 + DB に保存される
- getReactions で 10 ラウンド分取得 → 全 round の theme / choice / is_match が正しい
- 401 / 403 / 404 / 409 / 410 / 400

### dev で疎通

```bash
curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"theme_id":5,"choice_id":12,"round_number":2}' \
  http://localhost:8080/api/matching/sessions/1/reaction

curl -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/sessions/1/reactions
```

## 既知の未対応 / 後続 step に持ち越し

- 「相手が未回答なら "?" マスク表示」の UI 制御は step11（フロント）で実装
- バブル UI / 紙吹雪エフェクトは step11
- スタンプ送信は step7
