# step2-api-matching-join-leave-status.md

マッチング待機キュー API を実装する。`POST /api/matching/join` / `DELETE /api/matching/leave` / `GET /api/matching/status`。**Pub/Sub と SSE は step3 で実装** するため、本 step ではマッチング成立判定は行うがクライアントへのリアルタイム通知は含めない（マッチング成立時は両ユーザーを Redis から削除して `MatchingSession` を作るところまで）。

設計詳細は `docs/spec/matching/README.md` の [マッチングキュー](./README.md#マッチングキュー) を参照。依存: step1（DB）。

## 仕様

- 認証: Access Token 必須
- Redis Sorted Set `matching:queue`: `score=timestamp(ms)`、`member=userId`
- 同時に複数のキューエントリを持てない（既に WAITING ならエラー）
- `is_onboarded=true` のユーザーのみキュー参加可能
- マッチング照合: ZRANGE で最古エントリ取得 → 自分以外がいれば `WATCH/MULTI/EXEC` で排他削除 → セッション作成
- ブロック関係チェック: `blocks` テーブルで双方向に確認

## 対応内容

### スキーマ定義（`packages/schema/src/api-schema/matching.ts`、新規）

```typescript
import { z } from "zod"

// POST /api/matching/join
export const joinMatchingResponseSchema = z.object({
  matched: z.boolean(),
  /** matched=true 時のみ */
  session_id: z.number().int().nullable(),
  livekit_room_name: z.string().nullable(),
  peer: z.object({
    avatar_url: z.string().nullable(),
    id: z.number().int(),
    name: z.string().nullable(),
  }).nullable(),
})

// GET /api/matching/status
export const getMatchingStatusResponseSchema = z.object({
  status: z.enum(["WAITING", "MATCHED", "NONE"]),
  /** WAITING のときのみ */
  position: z.number().int().nullable(),
  waited_seconds: z.number().int().nullable(),
})

export type JoinMatchingResponse = z.infer<typeof joinMatchingResponseSchema>
export type GetMatchingStatusResponse = z.infer<typeof getMatchingStatusResponseSchema>
```

`packages/schema/src/api-schema/index.ts` から re-export。

### Redis Repository

`apps/api/src/repository/redis/matching-queue-repository.ts`（新規）。

```typescript
export interface MatchingQueueRedisRepository {
  /** 既に WAITING なら false を返す */
  add(userId: number): Promise<boolean>
  /** 自分以外の最古ユーザー id を 1 件返す（いない / 自分のみなら null） */
  findOldestPeer(myUserId: number): Promise<number | null>
  /** 排他削除。両者を同時に削除できなければ false */
  removeBothAtomic(userIdA: number, userIdB: number): Promise<boolean>
  remove(userId: number): Promise<void>
  /** ZSCORE で参加時刻 ms を取得（いなければ null） */
  findJoinedAt(userId: number): Promise<number | null>
  /** ZRANK で 0 始まりの位置を取得 */
  findPosition(userId: number): Promise<number | null>
}
```

実装は `ioredis` の `zadd` / `zrange` / `zscore` / `zrank` / `multi` を使う。`removeBothAtomic` は `WATCH matching:queue` → `MULTI` → `ZREM userIdA` → `ZREM userIdB` → `EXEC` のパターン。

### DB Repository

step1 で作った `MatchingQueueRepository` / `MatchingSessionRepository` を Prisma 実装で追加。`upsert` でキュー登録、`createSession(user1Id, user2Id, livekitRoomName)` でセッション作成。

### Service: `joinMatching` / `leaveMatching` / `getMatchingStatus`

`apps/api/src/service/matching-service.ts`（新規）。

```typescript
export const joinMatching = async (
  userId: number,
  repo: {
    blockRepository: BlockRepository
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingQueueRepository: MatchingQueueRepository
    matchingSessionRepository: MatchingSessionRepository
    userRepository: UserRepository
  }
): Promise<Result<JoinMatchingOutput>> => {
  // 1. user が is_onboarded=true か確認 → なければ 400
  // 2. Redis に既に WAITING ならば 409
  // 3. ZADD でキュー登録
  // 4. 自分以外の最古ユーザーを探す → いなければ matched: false で返却（DB 側 MatchingQueue を upsert で WAITING に）
  // 5. 自分以外がいたらブロック関係チェック → ブロック関係があればその peer をスキップして次のエントリ確認 (実装簡略のため最初の peer がブロック関係なら今回はマッチング成立とせず WAITING に戻す)
  // 6. removeBothAtomic で排他削除 → 失敗すれば再試行 / WAITING に戻す
  // 7. MatchingSession を作成（livekit_room_name = `matching:${session.id}` で update）
  // 8. matched: true で peer 情報と session_id / livekit_room_name を返却
}
```

注意: livekit_room_name は `matching:${sessionId}` だが sessionId 採番後に決まるため、セッション作成 → `update` で room name 設定 という 2 step 構成にする。

### Controller / Router / DI

`apps/api/src/controller/matching/join.ts` / `leave.ts` / `status.ts`（新規）。

`apps/api/src/routes/matching-router.ts`（新規）:

```typescript
// POST /api/matching/join
// DELETE /api/matching/leave
// GET /api/matching/status
```

`index.ts` で配線。

## 動作確認

### Service ユニットテスト

`apps/api/test/service/matching-service/joinMatching.test.ts`（新規）。

- 既に WAITING で再 join → 409 CONFLICT
- 待機者 0 人 → matched: false、Redis に登録される
- 待機者 1 人（ブロック関係なし） → matched: true、両者キューから削除、MatchingSession 作成
- ブロック関係がある相手 → 自分は WAITING のまま（peer は変わらず）
- is_onboarded=false → 400 BAD_REQUEST

### Controller integration テスト

`apps/api/test/controller/matching/join.test.ts`（新規）。

- 200 / 401 / 409 / 400 のステータス確認
- 200 + matched: true のときに `matching_sessions` に行が作られている（toMatchObject で確認）
- 200 + matched: false のときに Redis Sorted Set に自分が登録されている（実 Redis）

### dev で疎通

```bash
curl -X POST -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/join
curl -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/status
curl -X DELETE -H "Authorization: Bearer <token>" http://localhost:8080/api/matching/leave
```

2 つのターミナルで別ユーザーの token を使い、片方が join → 1 秒後に他方が join で `matched: true` が返ること。

## 既知の未対応 / 後続 step に持ち越し

- リアルタイム通知（SSE / Pub/Sub）は step3
- LiveKit トークン発行は step4
- 待機ユーザー一覧取得 API（ロビー画面用）は step10 のフロント実装と合わせて検討（`GET /api/matching/queue` を新設するか、既存 status を全体取得できるよう拡張するか）
