# step1-db-profile.md

`users` テーブルに **birth_date / gender / mbti / location / coin_balance** を追加し、`Gender` enum、趣味マスター（`hobby_masters`）と中間テーブル（`user_hobbies`）、マッチングフィルタ（`matching_preferences`、複数選択対応）を新設する。

設計詳細は `docs/spec/profile/README.md` の [DB 設計](./README.md#db-設計) を参照。

## 対応内容

### Prisma スキーマ更新

`apps/api/src/prisma/schema.prisma`。既存 `User` モデルに 5 カラム追加し、`Gender` enum、`MatchingPreference` / `HobbyMaster` / `UserHobby` モデルを新規追加する。

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
    /// MBTI タイプ（INTJ, ENFP 等）。オンボーディングはスキップ可、編集で設定可能
    mbti        String?  @db.VarChar(4)
    /// 居住地域。オンボーディングはスキップ可、編集で設定可能
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
    hobbies             UserHobby[]
    matchingPreference  MatchingPreference?

    @@map("users")
}

// 趣味マスター（Admin で管理）
model HobbyMaster {
    id        Int      @id @default(autoincrement())
    name      String   @unique @db.VarChar(50)
    sortOrder Int      @default(0) @map("sort_order")
    isActive  Boolean  @default(true) @map("is_active")
    createdAt DateTime @default(now()) @map("created_at")
    updatedAt DateTime @updatedAt @map("updated_at")

    users UserHobby[]

    @@index([isActive, sortOrder])
    @@map("hobby_masters")
}

// ユーザーと趣味の中間テーブル（多対多）
model UserHobby {
    id        Int      @id @default(autoincrement())
    userId    Int      @map("user_id")
    hobbyId   Int      @map("hobby_id")
    createdAt DateTime @default(now()) @map("created_at")

    user  User        @relation(fields: [userId], references: [id], onDelete: Cascade)
    hobby HobbyMaster @relation(fields: [hobbyId], references: [id], onDelete: Cascade)

    @@unique([userId, hobbyId])
    @@index([userId])
    @@index([hobbyId])
    @@map("user_hobbies")
}

// マッチングフィルタ設定（複数選択対応）
model MatchingPreference {
    id                 Int      @id @default(autoincrement())
    userId             Int      @unique @map("user_id")
    /// 希望する相手の性別（空配列 = 制限なし）
    preferredGenders   Gender[] @map("preferred_genders")
    /// 希望する最小年齢（null = 制限なし）
    ageMin             Int?     @map("age_min")
    /// 希望する最大年齢（null = 制限なし）
    ageMax             Int?     @map("age_max")
    /// 希望する相手の居住地域（空配列 = 制限なし）
    preferredLocations String[] @map("preferred_locations")
    /// 希望する相手の MBTI 値（空配列 = 制限なし）
    preferredMbti      String[] @map("preferred_mbti")
    /// 希望する相手の趣味 hobby_master.id（空配列 = 制限なし）
    preferredHobbyIds  Int[]    @map("preferred_hobby_ids")
    createdAt          DateTime @default(now()) @map("created_at")
    updatedAt          DateTime @updatedAt @map("updated_at")

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)

    @@index([userId])
    @@map("matching_preferences")
}
```

### nullable / 空配列の運用ルール

- `birth_date` / `gender`: nullable（既存ユーザー対応）。アプリ層で「is_onboarded=true なら必須」を担保
- `mbti` / `location`: nullable（任意項目）。値が無いユーザーはマッチングフィルタの対象外
- `MatchingPreference.preferredGenders` 等の配列: 空配列 = 制限なし（NULL は使わず空配列で統一）
- `MatchingPreference` レコードはユーザー作成時に **作らない**。フィルタ初設定時に upsert する（API 側の責務、step6）

### マイグレーション生成

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name phase3_users_hobbies_matching_pref
```

生成 SQL に以下が含まれること:

- `ALTER TABLE "users" ADD COLUMN "birth_date" DATE`
- `ALTER TABLE "users" ADD COLUMN "gender" "Gender"`
- `ALTER TABLE "users" ADD COLUMN "mbti" VARCHAR(4)`
- `ALTER TABLE "users" ADD COLUMN "location" VARCHAR(100)`
- `ALTER TABLE "users" ADD COLUMN "coin_balance" INTEGER NOT NULL DEFAULT 0`
- `CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER')`
- `CREATE TABLE "hobby_masters" (...)`
- `CREATE TABLE "user_hobbies" (...)`
- `CREATE TABLE "matching_preferences" (... preferred_genders "Gender"[], preferred_locations TEXT[], preferred_mbti TEXT[], preferred_hobby_ids INTEGER[] ...)`

### Domain 型の更新

`apps/api/src/types/domain/user.ts` に新フィールド追加。

```typescript
export type Gender = "MALE" | "FEMALE" | "OTHER"

export type User = {
  avatarUrl: string | null
  bio: string | null
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

`apps/api/src/types/domain/hobby.ts`（新規）:

```typescript
export type Hobby = {
  id: number
  name: string
  sortOrder: number
}
```

`apps/api/src/types/domain/matching-preference.ts`（新規）:

```typescript
import type { Gender } from "./user"

export type MatchingPreference = {
  ageMax: number | null
  ageMin: number | null
  id: number
  preferredGenders: Gender[]
  preferredHobbyIds: number[]
  preferredLocations: string[]
  preferredMbti: string[]
  userId: number
}
```

`apps/api/src/types/domain/index.ts` にバレルエクスポートを追加。

```typescript
export type { User, Gender } from "./user"
export type { AuthAccount, AuthAccountWithUser } from "./auth-account"
export type { Memo } from "./memo"
export type { Hobby } from "./hobby"
export type { MatchingPreference } from "./matching-preference"
```

### Repository の `_toDomain` 更新

`apps/api/src/repository/prisma/user-repository.ts` の `_toDomainUser` で新フィールド追加。

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

### シード追加: 趣味マスター

`apps/api/src/prisma/seed.ts` に `hobby_masters` のシードを追加。基本 20 件程度から開始（Admin で随時追加できる前提）。

```typescript
type HobbyMasterSeed = {
  name: string
  sortOrder: number
}

const hobbyMasters: HobbyMasterSeed[] = [
  { name: "音楽鑑賞", sortOrder: 1 },
  { name: "映画", sortOrder: 2 },
  { name: "読書", sortOrder: 3 },
  { name: "アニメ・漫画", sortOrder: 4 },
  { name: "ゲーム", sortOrder: 5 },
  { name: "スポーツ観戦", sortOrder: 6 },
  { name: "サッカー", sortOrder: 7 },
  { name: "野球", sortOrder: 8 },
  { name: "バスケットボール", sortOrder: 9 },
  { name: "筋トレ", sortOrder: 10 },
  { name: "ランニング", sortOrder: 11 },
  { name: "ヨガ", sortOrder: 12 },
  { name: "料理", sortOrder: 13 },
  { name: "カフェ巡り", sortOrder: 14 },
  { name: "旅行", sortOrder: 15 },
  { name: "キャンプ", sortOrder: 16 },
  { name: "写真", sortOrder: 17 },
  { name: "プログラミング", sortOrder: 18 },
  { name: "アート・絵画", sortOrder: 19 },
  { name: "ペット", sortOrder: 20 },
]

const upsertHobbyMaster = async (hobby: HobbyMasterSeed): Promise<void> => {
  await prisma.hobbyMaster.upsert({
    create: { isActive: true, name: hobby.name, sortOrder: hobby.sortOrder },
    update: { sortOrder: hobby.sortOrder },
    where: { name: hobby.name },
  })
}

// main() 内で呼ぶ
console.log("Seeding hobby_masters...")
for (const hobby of hobbyMasters) {
  await upsertHobbyMaster(hobby)
}
```

### Prisma client 再生成

```bash
cd apps/api && pnpm prisma generate
```

## 動作確認

### マイグレーション適用

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name phase3_users_hobbies_matching_pref
```

`Database is now in sync` が出力されること。

### シード実行

```bash
npx dotenvx run -f .env.local -- pnpm prisma db seed
```

### スキーマの反映を確認

```bash
npx dotenvx run -f .env.local -- pnpm prisma studio
```

Studio で:

- `User` テーブルに `birth_date / gender / mbti / location / coin_balance` カラム
- `HobbyMaster` テーブルに 20 件のシードデータ
- `UserHobby` テーブル（空）
- `MatchingPreference` テーブル（空、配列カラム 4 種）
- `Gender` enum

### TypeScript / ビルド

```bash
cd apps/api && pnpm build
```

`User` 型変更で既存箇所（`auth-service` / `google.ts` 等）が壊れていれば順次修正。

### 既存テスト実行

```bash
cd apps/api && pnpm test
```

既存 Service ユニットテストでモック User を使っている箇所は新フィールド分の追加が必要。例:

```typescript
const mockUser: User = {
  avatarUrl: null,
  bio: null,
  birthDate: null,
  coinBalance: 0,
  createdAt: new Date(),
  email: "u@example.com",
  gender: null,
  id: 1,
  isOnboarded: false,
  location: null,
  mbti: null,
  name: null,
  updatedAt: new Date(),
}
```

### CI 用テスト

```bash
pnpm test:ci
```

`prisma migrate deploy` が通ること（マイグレーションが冪等）。

## 既知の未対応 / 後続 step に持ち越し

- API レイヤーの GET / PUT / onboarding は step2〜4
- 趣味マスター取得 API は step5
- `MatchingPreference` の API は step6
- 18 歳バリデーションは Service 層（step3 / step4）
- `hobby_masters` の Admin 管理画面は将来フェーズ
