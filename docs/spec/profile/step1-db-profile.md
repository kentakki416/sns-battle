# step1-db-profile.md

`users` テーブルに **birth_date / gender / mbti / location / coin_balance** を追加し、`Gender` enum と `matching_preferences` テーブルを新設する。あわせてシードに既存 dev ユーザーの `birth_date` / `gender` を埋める。

設計詳細は `docs/spec/profile/README.md` の [DB 設計](./README.md#db-設計) を参照。

## 対応内容

### Prisma スキーマ更新

`apps/api/src/prisma/schema.prisma`。既存 `User` モデルに 5 カラム追加し、`Gender` enum と `MatchingPreference` モデルを新規追加する。

```prisma
// 性別
enum Gender {
    MALE
    FEMALE
    OTHER
}

model User {
    id          Int      @id @default(autoincrement())
    email       String?  @unique
    name        String?
    avatarUrl   String?  @map("avatar_url")
    /// 自己紹介文（プロフィール画面で表示）。Google から取得しないためオンボーディングまたはプロフィール編集で入力する
    bio         String?  @db.Text
    /// 生年月日（年齢は計算で算出）。オンボーディングで必須入力
    birthDate   DateTime? @map("birth_date") @db.Date
    /// 性別（MALE / FEMALE / OTHER）。オンボーディングで必須入力
    gender      Gender?
    /// MBTI タイプ（INTJ, ENFP 等）。将来フェーズで利用するため nullable
    mbti        String?  @db.VarChar(4)
    /// 居住地域（将来フェーズ）。プロフィールに任意で表示
    location    String?  @db.VarChar(100)
    /// コイン残高（将来フェーズ：課金・ショップ）
    coinBalance Int      @default(0) @map("coin_balance")
    /// オンボーディング完了フラグ。初回ログイン後の必須プロフィール設定（表示名・生年月日・性別など）が完了したら true に更新する。サインイン直後にこの値が false なら /onboarding へ誘導する
    isOnboarded Boolean  @default(false) @map("is_onboarded")
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    accounts            AuthAccount[]
    followers           Follow[]              @relation("UserFollowers")
    following           Follow[]              @relation("UserFollowees")
    blocked             Block[]               @relation("UserBlocker")
    blockedBy           Block[]               @relation("UserBlocked")
    matchingPreference  MatchingPreference?

    @@map("users")
}

// マッチングフィルタ設定（将来フェーズで利用、Spec1 では DB のみ）
model MatchingPreference {
    id              Int      @id @default(autoincrement())
    userId          Int      @unique @map("user_id")
    preferredGender Gender?  @map("preferred_gender")
    ageMin          Int?     @map("age_min")
    ageMax          Int?     @map("age_max")
    createdAt       DateTime @default(now()) @map("created_at")
    updatedAt       DateTime @updatedAt @map("updated_at")

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
    @@map("matching_preferences")
}
```

### `birth_date` / `gender` の nullable について

- DB は **nullable** にする（既存ユーザーは未設定で残るため）
- アプリケーション層では「オンボーディング済（is_onboarded=true）のユーザーは必須」というルールで運用する
- API のバリデーション（step3 / step4）で 18 歳以上 / 120 歳以下 / 値必須をチェック

### マイグレーション生成

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name phase3_users_profile_fields
```

生成されるマイグレーション名は `{タイムスタンプ}_phase3_users_profile_fields/migration.sql`。生成 SQL に以下が含まれること:

- `ALTER TABLE "users" ADD COLUMN "birth_date" DATE`
- `ALTER TABLE "users" ADD COLUMN "gender" "Gender"`
- `ALTER TABLE "users" ADD COLUMN "mbti" VARCHAR(4)`
- `ALTER TABLE "users" ADD COLUMN "location" VARCHAR(100)`
- `ALTER TABLE "users" ADD COLUMN "coin_balance" INTEGER NOT NULL DEFAULT 0`
- `CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER')`
- `CREATE TABLE "matching_preferences" (...)`

### Domain 型の更新

`apps/api/src/types/domain/user.ts` に新フィールドを追加。

```typescript
export type Gender = "MALE" | "FEMALE" | "OTHER"

export type User = {
  avatarUrl: string | null
  bio: string | null
  /**
   * 生年月日。is_onboarded=true のユーザーは必ず値を持つ。
   */
  birthDate: Date | null
  coinBalance: number
  createdAt: Date
  email: string | null
  gender: Gender | null
  id: number
  isOnboarded: boolean
  location: string | null
  mbti: string | null
  name: string | null
  updatedAt: Date
}
```

### Repository の `_toDomain` 更新

`apps/api/src/repository/prisma/user-repository.ts` の `_toDomainUser` で新フィールドをマッピング。

```typescript
private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
  return {
    avatarUrl: prismaUser.avatarUrl,
    bio: prismaUser.bio,
    birthDate: prismaUser.birthDate,
    coinBalance: prismaUser.coinBalance,
    createdAt: prismaUser.createdAt,
    email: prismaUser.email,
    gender: prismaUser.gender,
    id: prismaUser.id,
    isOnboarded: prismaUser.isOnboarded,
    location: prismaUser.location,
    mbti: prismaUser.mbti,
    name: prismaUser.name,
    updatedAt: prismaUser.updatedAt,
  }
}
```

### `auth-router.ts` 等で `User` を返している既存箇所への影響

`AuthMeController` のレスポンス（`authMeResponseSchema`）も将来 birth_date 等を返す必要があるが、**この step ではスキーマ変更しない**（`authMeResponseSchema` は `is_onboarded` までで十分）。step3 / step4 で `getUserResponseSchema` を新規定義する。

ただし `User` 型に新フィールドを追加した時点で TypeScript エラーが出るため、`authMeResponseSchema.parse({ ... })` の引数オブジェクトには触らないが、`User` 型を扱う既存ロジック（auth-service / google.ts 等）が壊れないことを `pnpm build` で確認する。

### シード更新（Phase 3 範囲に限定）

`apps/api/src/prisma/seed.ts` には Phase 0 で stamp / talkTheme のみ。**dev ユーザーのシードは現時点で存在しない**ため、本 step では追加しない。実 dev 環境では Google サインイン経由でユーザーが作られるため、既存ユーザーは `birth_date=null, gender=null, is_onboarded=false` のままで残る（API 側のオンボーディング動線で更新される）。

### Prisma client 再生成

```bash
cd apps/api && pnpm prisma generate
```

これで `prisma/generated/` に新しい型が出力される。

## 動作確認

### マイグレーション適用

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name phase3_users_profile_fields
```

`Database is now in sync` が出力されること。

### スキーマの反映を確認

```bash
npx dotenvx run -f .env.local -- pnpm prisma studio
```

Studio で:

- `User` テーブルに `birth_date / gender / mbti / location / coin_balance` カラムがあること
- `MatchingPreference` テーブルが新規作成されていること
- `Gender` enum が定義されていること

### TypeScript / ビルド確認

```bash
cd apps/api && pnpm build
```

`User` 型変更による型エラーが既存箇所で発生していないこと。発生した場合は影響箇所（auth-service / google.ts / `_toDomainUser` 等）を順に修正する。

### 既存テストの実行

```bash
cd apps/api && pnpm test
```

既存の Service ユニットテスト（`getUserById.test.ts` 等）でモック User を作っている箇所は新フィールド分の追加が必要。例:

```typescript
const mockUser: User = {
  avatarUrl: "...",
  bio: null,
  birthDate: null,
  coinBalance: 0,
  createdAt: new Date(),
  email: "...",
  gender: null,
  id: 1,
  isOnboarded: false,
  location: null,
  mbti: null,
  name: "...",
  updatedAt: new Date(),
}
```

既存テストが通ること。

### CI 用テスト

```bash
pnpm test:ci
```

CI 用には `prisma migrate deploy` が走るため、マイグレーションが冪等であること。

## 既知の未対応 / 後続 step に持ち越し

- API レイヤーの `GetUserResponseSchema`（年齢を計算してレスポンスに含める）は step2 で実装
- 18 歳以上バリデーションは step3 / step4 の Service 層で実装
- `MatchingPreference` の API は将来フェーズ。本 step では DB のみ用意
