# step2-api-matching-join-leave-status.md

マッチング待機キュー API を実装する。`POST /api/matching/join` / `DELETE /api/matching/leave` / `GET /api/matching/status`。**Pub/Sub と SSE は step3 で実装** するため、本 step ではマッチング成立判定は行うがクライアントへのリアルタイム通知は含めない（マッチング成立時は両ユーザーを Redis から削除して `MatchingSession` を作るところまで）。

設計詳細は `docs/spec/matching/README.md` の [マッチングキュー](./README.md#マッチングキュー) を参照。依存: step1（DB）。

## 仕様

- 認証: Access Token 必須
- Redis Sorted Set `matching:queue`: `score=timestamp(ms)`、`member=userId`
- 同時に複数のキューエントリを持てない（既に WAITING ならエラー）
- `is_onboarded=true` のユーザーのみキュー参加可能
- マッチング照合（多段方式）:
  1. `ZRANGE` で待機時間が長い順に上位 100 件の候補を取得
  2. ブロック関係（双方向）にあるユーザーを除外
  3. 双方向 preference 適合チェック（性別 / 年齢 / 居住地域）
  4. 適合した最初の候補と `WATCH/MULTI/EXEC` で排他削除 → セッション作成
  5. 競合（他リクエストに先取り）したら次の候補へリトライ

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
  add(userId: number, joinedAtMs: number): Promise<boolean>
  /**
   * 自分以外の待機ユーザーを「待機時間が長い順」に最大 limit 件返す。
   * 多段照合（ブロック / preference 適合）のため複数候補を返す。
   */
  findTopWaitingUsers(myUserId: number, limit: number): Promise<number[]>
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

#### 一括取得用の補助メソッド（多段照合の N+1 回避）

| Repository | メソッド | 用途 |
|-----------|---------|------|
| `BlockRepository` | `findBlockedUserIds(userId): Promise<Set<number>>` | 自分とブロック関係（双方向）の全 user id を一括取得 |
| `UserRepository` | `findManyByIds(ids: number[]): Promise<User[]>` | 候補ユーザーをまとめて取得 |
| `MatchingPreferenceRepository` | `findManyByUserIds(userIds: number[]): Promise<Map<number, MatchingPreference>>` | 候補の preference をまとめて取得 |

### DB Repository

step1 で作った `MatchingQueueRepository` / `MatchingSessionRepository` を Prisma 実装で追加。`upsert` でキュー登録、`createSession(user1Id, user2Id, livekitRoomName)` でセッション作成。

### Service: `joinMatching` / `leaveMatching` / `getMatchingStatus`

`apps/api/src/service/matching-service.ts`（新規）。

```typescript
export const joinMatching = async (
  userId: number,
  repo: {
    blockRepository: BlockRepository
    matchingEventPublisher: MatchingEventPublisher
    matchingPreferenceRepository: MatchingPreferenceRepository
    matchingQueueRedisRepository: MatchingQueueRedisRepository
    matchingQueueRepository: MatchingQueueRepository
    matchingSessionRepository: MatchingSessionRepository
    userRepository: UserRepository
  }
): Promise<Result<JoinMatchingOutput>> => {
  // 1. user が is_onboarded=true か確認 → なければ 400
  // 2. Redis に既に WAITING ならば 409
  // 3. ZADD でキュー登録 + DB の matching_queue に WAITING で upsert
  // 4. findTopWaitingUsers(myUserId, 100) で上位 100 候補を取得
  // 5. findBlockedUserIds(myUserId) で自分とブロック関係の id を一括取得 → 候補から除外
  // 6. 残り候補の User と MatchingPreference を一括取得（findManyByIds / findManyByUserIds）
  // 7. 候補を待機時間順にループ:
  //    a. 双方向 preference 適合チェック（matchesPreferences ヘルパー）
  //    b. 適合した候補に対して removeBothAtomic を実行
  //    c. 競合で失敗したら次候補へ continue
  // 8. 成立した候補で MatchingSession 作成
  //    - livekit_room_name = `matching:${session.id}`
  // 9. matchingEventPublisher.publishMatched で両ユーザーに SSE 通知
  // 10. matched: true で peer 情報と session_id / livekit_room_name を返却
}
```

注意: livekit_room_name は `matching:${sessionId}` だが sessionId 採番後に決まるため、セッション作成 → `update` で room name 設定 という 2 step 構成にする。

#### preference 適合判定ヘルパー

`matchesPreferences(me, them, myPref, theirPref): boolean` を Service 内に定義。`null` の preference は「制限なし」として常に true を返す。実装の詳細は [README#マッチングフィルタリング](./README.md#マッチングフィルタリング) 参照。

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
- 待機者 1 人（ブロック・preference 制限なし） → matched: true、両者キューから削除、MatchingSession 作成
- ブロック関係がある相手しかいない → 自分は WAITING のまま
- 最古ユーザーがブロック相手 → 次候補にスキップして成立（多段照合）
- is_onboarded=false → 400 BAD_REQUEST
- preference 性別: 自分側 / 相手側どちらが NG でも matched=false（双方向）
- preference 年齢: ageMin 未満 / ageMax 超過 / birthDate=null + 年齢制限あり で不成立
- preference 居住地域: preferredLocations に含まれない → 不成立
- preference 不適合候補をスキップして 2 番目の候補で成立
- removeBothAtomic 競合 → 次候補にリトライ
- 全候補が競合敗北 → matched=false（セッション作成なし）

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
