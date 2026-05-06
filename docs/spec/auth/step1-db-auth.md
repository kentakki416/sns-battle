# step1-db-auth.md

`users` テーブルに `bio` / `is_onboarded` カラムを追加し、Refresh Token のローテーション管理用に Redis を利用する方針を確定する（DB テーブルは追加しない）。

Phase 0 で `auth_accounts` / `follows` / `blocks` 等は導入済み。本 step の対象は **`users` の拡張のみ**。`birth_date` / `gender` / `mbti` / `location` / `coin_balance` は profile 機能（Phase 3）で別 step として追加する。

## 対応内容

### Prisma スキーマ拡張

`apps/api/src/prisma/schema.prisma` の `User` モデルにフィールドを追加する。

```prisma
model User {
    id          Int      @id @default(autoincrement())
    email       String?  @unique
    name        String?
    avatarUrl   String?  @map("avatar_url")
    bio         String?  @db.Text
    isOnboarded Boolean  @default(false) @map("is_onboarded")
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    accounts  AuthAccount[]
    followers Follow[]      @relation("UserFollowers")
    following Follow[]      @relation("UserFollowees")
    blocked   Block[]       @relation("UserBlocker")
    blockedBy Block[]       @relation("UserBlocked")

    @@map("users")
}
```

- `bio`: 自己紹介文（オンボーディング後に更新可能）
- `isOnboarded`: 初回オンボーディング完了フラグ。`/api/users/:id/onboarding` で `true` に更新する（PUT は profile 機能の step で実装）

### マイグレーション作成

```bash
cd apps/api
pnpm prisma migrate dev --name phase1_users_bio_onboarded
```

生成される SQL は概ね以下:

```sql
ALTER TABLE "users"
  ADD COLUMN "bio" TEXT,
  ADD COLUMN "is_onboarded" BOOLEAN NOT NULL DEFAULT false;
```

既存ユーザーには `is_onboarded = false` がデフォルトで入る。

### Domain 型の更新

`apps/api/src/types/domain/user.ts` にプロパティを追加する。

```typescript
export type User = {
    avatarUrl: string | null
    bio: string | null
    createdAt: Date
    email: string | null
    id: number
    isOnboarded: boolean
    name: string | null
    updatedAt: Date
}
```

### Repository の更新

`apps/api/src/repository/prisma/user-repository.ts` の `_toDomainUser` に新フィールドを追加する。`CreateUserInput` は変更不要（初期値で挿入）。

```typescript
private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
  return {
    avatarUrl: prismaUser.avatarUrl,
    bio: prismaUser.bio,
    createdAt: prismaUser.createdAt,
    email: prismaUser.email,
    id: prismaUser.id,
    isOnboarded: prismaUser.isOnboarded,
    name: prismaUser.name,
    updatedAt: prismaUser.updatedAt,
  }
}
```

`UserRegistrationRepository`（`apps/api/src/repository/prisma/aggregate/`）も同様に `_toDomain` を持つ場合は新フィールドを返すよう修正する。

### `@repo/api-schema` の更新

`packages/schema/src/api-schema/auth.ts` の `authMeResponseSchema` と `authGoogleCallbackResponseSchema.user` に以下を追加する。snake_case 命名・キーはアルファベット順（`id` 先頭、`created_at` 末尾の例外ルールに従う）。

```typescript
export const authMeResponseSchema = z.object({
  avatar_url: z.string().nullable(),
  bio: z.string().nullable(),
  email: z.string().nullable(),
  id: z.number(),
  is_onboarded: z.boolean(),
  name: z.string().nullable(),
  created_at: z.string(),
})
```

スキーマ変更後は必ず:

```bash
cd packages/schema && pnpm build
```

### Refresh Token 管理方針（DB ではなく Redis）

Refresh Token は **JWT として発行し、`jti`（JWT ID, UUID）を Redis に保存する**。検証時に Redis に存在するかを確認、ローテーション時 / ログアウト時に削除する。

- Redis Key: `refresh_token:{jti}` → Value: `{userId}`
- TTL: 7 日（Refresh Token の有効期限と同期）

DB テーブルは作らない。理由:
- Refresh Token は使い捨て（ローテーション）+ 短い TTL なので RDB に置く必要が薄い
- 既に `apps/api/src/client/redis.ts` で接続済み

実装は step3 で行うため、本 step では方針メモのみ。

## 動作確認

### マイグレーション適用と Prisma Client の再生成

```bash
cd apps/api
pnpm prisma migrate dev --name phase1_users_bio_onboarded
pnpm prisma generate
```

### マイグレーション結果の確認

```bash
psql $DATABASE_URL -c "\d users"
```

期待値: `bio` text / `is_onboarded` boolean が含まれる。

### スキーマパッケージのビルド

```bash
cd packages/schema && pnpm build
cd apps/api && pnpm build
```

型エラーなくコンパイルが通ること。

### 既存テストが落ちないこと

```bash
cd apps/api && pnpm test
```

`auth-service` / `user-service` のユニットテストで `User` 型の必須プロパティ（`bio`, `isOnboarded`）が増えるため、テストフィクスチャの調整が必要なら同 step で対応する。
