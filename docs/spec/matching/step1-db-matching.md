# step1-db-matching.md

マッチング機能の DB を新設する。`matching_queue`（待機キュー）、`matching_sessions`（1対1セッション記録）、`matching_reactions`（テーマ回答記録）の 3 テーブル + 関連 enum を Prisma スキーマに追加する。

設計詳細は `docs/spec/matching/README.md` の [DB 設計](./README.md#db-設計) を参照。

実データは無いため migration はクリーン構成（drop 不要）。Phase 0 で作成済みの `talk_themes` / `talk_theme_choices` は変更せずそのまま使う。

## 対応内容

### 追加 enum

```prisma
enum MatchingQueueStatus {
    WAITING
    MATCHED
    CANCELLED
}

enum MatchingSessionStatus {
    COUNTDOWN
    ACTIVE
    ENDED
}

enum MatchingEndReason {
    TIMEOUT
    USER_LEFT
    MANUAL
}
```

### 追加モデル

```prisma
// マッチング待機キュー（Redis Sorted Set がプライマリ、DB はバックアップ／監査用）
model MatchingQueue {
    id        Int                 @id @default(autoincrement())
    userId    Int                 @unique @map("user_id")
    status    MatchingQueueStatus @default(WAITING)
    createdAt DateTime            @default(now()) @map("created_at")
    updatedAt DateTime            @updatedAt @map("updated_at")

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([status, createdAt])
    @@map("matching_queue")
}

// 1対1ビデオ通話のセッション記録
model MatchingSession {
    id               Int                   @id @default(autoincrement())
    user1Id          Int                   @map("user1_id")
    user2Id          Int                   @map("user2_id")
    livekitRoomName  String                @unique @map("livekit_room_name") @db.VarChar(255)
    status           MatchingSessionStatus @default(COUNTDOWN)
    startedAt        DateTime?             @map("started_at")
    endedAt          DateTime?             @map("ended_at")
    endReason        MatchingEndReason?    @map("end_reason")
    createdAt        DateTime              @default(now()) @map("created_at")

    user1     User                @relation("MatchingSessionUser1", fields: [user1Id], references: [id], onDelete: Cascade)
    user2     User                @relation("MatchingSessionUser2", fields: [user2Id], references: [id], onDelete: Cascade)
    reactions MatchingReaction[]

    @@index([user1Id, status])
    @@index([user2Id, status])
    @@map("matching_sessions")
}

// トークテーマへの回答記録
model MatchingReaction {
    id          Int      @id @default(autoincrement())
    sessionId   Int      @map("session_id")
    userId      Int      @map("user_id")
    themeId     Int      @map("theme_id")
    choiceId    Int?     @map("choice_id")
    roundNumber Int      @map("round_number")
    createdAt   DateTime @default(now()) @map("created_at")

    session MatchingSession  @relation(fields: [sessionId], references: [id], onDelete: Cascade)
    user    User             @relation(fields: [userId], references: [id], onDelete: Cascade)
    theme   TalkTheme        @relation(fields: [themeId], references: [id], onDelete: Restrict)
    choice  TalkThemeChoice? @relation(fields: [choiceId], references: [id], onDelete: SetNull)

    @@unique([sessionId, userId, roundNumber])
    @@index([sessionId])
    @@map("matching_reactions")
}
```

### User モデルへのリレーション追加

```prisma
model User {
    // ...既存
    matchingQueue       MatchingQueue?
    matchingSessionsAs1 MatchingSession[]  @relation("MatchingSessionUser1")
    matchingSessionsAs2 MatchingSession[]  @relation("MatchingSessionUser2")
    matchingReactions   MatchingReaction[]
}
```

### TalkTheme / TalkThemeChoice への逆リレーション追加

`reactions MatchingReaction[]` を両モデルに追加する。

### Domain 型

`apps/api/src/types/domain/matching-queue.ts`、`matching-session.ts`、`matching-reaction.ts` を新規作成し、`types/domain/index.ts` でバレルエクスポート。

```typescript
// matching-queue.ts
export type MatchingQueueStatus = "WAITING" | "MATCHED" | "CANCELLED"
export type MatchingQueue = {
    createdAt: Date
    id: number
    status: MatchingQueueStatus
    updatedAt: Date
    userId: number
}
```

セッション、リアクションも同様。

### マイグレーション発行

```bash
cd apps/api
docker exec -i sns-battle-postgres psql -U postgres -d "sns-battle_dev" -c "TRUNCATE matching_queue, matching_sessions, matching_reactions CASCADE" 2>/dev/null || true
npx dotenvx run -f .env.local -- npx prisma migrate dev --name phase4_matching_tables --create-only --config=src/prisma/prisma.config.ts
npx dotenvx run -f .env.local -- npx prisma migrate deploy --config=src/prisma/prisma.config.ts
npx dotenvx run -f .env.local -- npx prisma generate --config=src/prisma/prisma.config.ts
```

### test/controller/setup.ts に TRUNCATE 対象を追加

```typescript
const TABLE_NAMES = [
  "users",
  "auth_accounts",
  "memos",
  "hobby_masters",
  "user_hobbies",
  "matching_preferences",
  "matching_queue",
  "matching_sessions",
  "matching_reactions",
]
```

## 動作確認

### マイグレーション適用

```bash
cd apps/api && npx dotenvx run -f .env.local -- npx prisma migrate deploy --config=src/prisma/prisma.config.ts
```

「All migrations have been successfully applied.」が出力されること。

### Studio で確認

```bash
pnpm db:studio
```

- `matching_queue` / `matching_sessions` / `matching_reactions` テーブルが空で存在
- enum: `MatchingQueueStatus` / `MatchingSessionStatus` / `MatchingEndReason` が登録

### ビルド + 既存テスト

```bash
cd apps/api && pnpm build && pnpm test
```

既存 33 suites がグリーンであること（DB 変更のみのため新規テストはこの step では追加しない）。

## 既知の未対応 / 後続 step に持ち越し

- `MatchingQueue` の `Status` カラムは仕様上 WAITING のみ使われる（マッチング成立時は DB から削除）。MATCHED / CANCELLED は監査用のために enum に残す
- `livekit_room_name` の生成ルール（`matching:{sessionId}` 形式）は step5（sessions API）で確定
