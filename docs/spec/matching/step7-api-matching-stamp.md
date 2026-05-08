# step7-api-matching-stamp.md

`POST /api/matching/sessions/:id/stamp` を実装する。`items.type=STAMP` かつ `item_scopes` に `MATCHING` を含むアイテムをセッション中の相手に送信する。プレミアムスタンプは `user_inventory` 所持確認後に Data Channel `matching:stamp` を Room 全体に配信。

設計詳細は `docs/spec/matching/README.md` の [スタンプ送信](./README.md#スタンプ送信) を参照。依存: step1（DB）、step5（セッション API）、Phase 3.5 のアイテム DB（items / item_scopes / stamp_details / user_inventory）。

## 仕様

- 認証: Access Token 必須
- リクエスト: `{ "item_id": number }`
- 自分が参加者でない → 403、存在しない → 404、ENDED → 410
- `item_id` 検証:
  - `items.type='STAMP'` && `is_active=true` → でなければ 400
  - `item_scopes` に `(item_id, MATCHING)` が存在 → でなければ 400
  - `is_premium=true` の場合は `user_inventory` に `(user_id, item_id)` が存在し `quantity > 0` → でなければ 403
- レート制限: 1 ユーザーあたり 5 req/秒（Redis `INCR` + `EXPIRE 1`）
- Data Channel `matching:stamp` payload: `{ sender_id, item_id, emoji, animation_type }`
- DB には保存しない（揮発的）
- 永続化は将来 `matching_stamps` を追加する余地を残す

## 対応内容

### スキーマ定義

`packages/schema/src/api-schema/matching.ts` に追記:

```typescript
export const sendMatchingStampPathParamSchema = z.object({
  id: z.coerce.number().int().positive(),
})

export const sendMatchingStampRequestSchema = z.object({
  item_id: z.number().int().positive(),
})

export const sendMatchingStampResponseSchema = z.object({
  /** Data Channel で配信されたタイミング */
  delivered_at: z.number().int(),
  emoji: z.string(),
  item_id: z.number().int(),
})
```

### ItemRepository（Phase 3.5 の前提を活用）

`apps/api/src/repository/prisma/item-repository.ts`（新規）。

```typescript
export interface ItemRepository {
  /** type=STAMP かつ scope=MATCHING を含むアクティブ item の詳細を返す（StampDetail JOIN）。なければ null */
  findActiveStampForMatching(itemId: number): Promise<{
    id: number
    name: string
    isPremium: boolean
    emoji: string
    animationType: AnimationType
  } | null>
}
```

実装は `prisma.item.findFirst({ where: { id, type: "STAMP", isActive: true, scopes: { some: { scope: "MATCHING" } } }, include: { stampDetail: true } })`。

### UserInventoryRepository（新規）

```typescript
export interface UserInventoryRepository {
  hasItem(userId: number, itemId: number): Promise<boolean>
}
```

### Redis レート制限

`apps/api/src/repository/redis/rate-limit-repository.ts`（新規）。

```typescript
export interface RateLimitRedisRepository {
  /** key で 1 秒ウィンドウのカウントを INCR、初回は EXPIRE 1。limit を超えたら false を返す */
  incrementWithLimit(key: string, limit: number): Promise<boolean>
}
```

```typescript
async incrementWithLimit(key: string, limit: number): Promise<boolean> {
  const current = await this._redis.incr(key)
  if (current === 1) {
    await this._redis.expire(key, 1)
  }
  return current <= limit
}
```

### Service

```typescript
export const sendMatchingStamp = async (
  input: { sessionId, userId, itemId },
  repo: {
    itemRepository: ItemRepository
    matchingSessionRepository: MatchingSessionRepository
    rateLimitRedisRepository: RateLimitRedisRepository
    userInventoryRepository: UserInventoryRepository
  },
  client: { livekitClient: ILiveKitClient }
): Promise<Result<{ itemId, emoji, deliveredAt }>> => {
  // セッション参加者 / status チェック
  // レート制限: incrementWithLimit(`stamp_rate:${userId}`, 5) → false なら 429
  // item 検証: findActiveStampForMatching(itemId) → null なら 400
  // premium なら user_inventory チェック → なければ 403
  // Data Channel matching:stamp 配信（sender_id, item_id, emoji, animation_type）
  // ok({ itemId, emoji, deliveredAt: Date.now() })
}
```

429 用の `tooManyRequestsError` を `result.ts` に追加する。

### Controller / Router / DI

```typescript
router.post("/sessions/:id/stamp", ...)
```

## 動作確認

### Service ユニットテスト

- 正常系（free スタンプ）: ok、Data Channel publish される
- premium で user_inventory に所持あり → ok
- premium で所持なし → 403
- スタンプでないアイテム（type=EFFECT 等）→ 400
- scope=BATTLE のみのスタンプ → 400
- レート制限超過 → 429
- 非参加者 → 403
- ENDED セッション → 410

### Controller integration テスト

- 実 DB / 実 Redis でスタンプ送信 → 200
- 同一ユーザーで 6 回連続送信 → 6 回目が 429
- premium スタンプを所持なしで送信 → 403、所持を `user_inventory` に追加してから送信 → 200

### dev で疎通

```bash
# items テーブルから MATCHING スコープの STAMP id を確認
docker exec -i sns-battle-postgres psql -U postgres -d "sns-battle_dev" -c \
  "SELECT i.id, i.name FROM items i JOIN item_scopes s ON s.item_id=i.id WHERE i.type='STAMP' AND s.scope='MATCHING' LIMIT 5"

curl -X POST -H "Authorization: Bearer <token>" -H "Content-Type: application/json" \
  -d '{"item_id":1}' http://localhost:8080/api/matching/sessions/1/stamp
```

## 既知の未対応 / 後続 step に持ち越し

- スタンプ受信側の UI（`<StampFloatLayer>`）は step11（フロント）で実装
- 永続化（matching_stamps テーブル）は将来フェーズ
- レート制限のキー設計（ユーザー単位 vs セッション単位）はユーザー単位で開始。問題があれば見直し
