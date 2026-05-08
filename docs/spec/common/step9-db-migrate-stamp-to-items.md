# step9-db-migrate-stamp-to-items.md

Phase 0 で作成した `stamp_masters` テーブルを `items`（親）+ `stamp_details` + `item_scopes` に分解し、同時に `effect_details` / `boost_details` / `user_inventory` / `coin_transactions` を空テーブルとして新設する。Spec1（Phase 4 マッチング）でスタンプ送信 API が `items` を参照するため、**マッチング実装着手前**に必ず完了させる。

設計詳細は `docs/spec/common/README.md` の [items](./README.md#items) ～ [coin_transactions（将来フェーズ）](./README.md#coin_transactions将来フェーズ) を参照。

実データはほぼ無いため、`stamp_masters` を一度 drop して新スキーマを作り直す **クリーン migration** を採用する（バックフィル不要）。

## 対応内容

### Prisma スキーマ更新

`apps/api/src/prisma/schema.prisma`。既存の `StampCategory` enum と `StampMaster` モデルを削除し、新規モデルと enum を追加する。

#### 削除する定義

```prisma
/** 削除 */
enum StampCategory {
    GENERAL
    BATTLE
    MATCHING
}

/** 削除 */
model StampMaster {
    id            Int           @id @default(autoincrement())
    name          String        @db.VarChar(100)
    imageUrl      String?       @map("image_url") @db.VarChar(500)
    emoji         String        @db.VarChar(10)
    category      StampCategory
    animationType AnimationType @default(FLOAT) @map("animation_type")
    isPremium     Boolean       @default(false) @map("is_premium")
    price         Int           @default(0)
    sortOrder     Int           @default(0) @map("sort_order")
    isActive      Boolean       @default(true) @map("is_active")
    createdAt     DateTime      @default(now()) @map("created_at")
    updatedAt     DateTime      @updatedAt @map("updated_at")

    @@index([category, isActive, sortOrder])
    @@map("stamp_masters")
}
```

`AnimationType` enum はそのまま残す（`StampDetail.animationType` で再利用）。

#### 追加する enum

```prisma
/** アイテムの種別。新カテゴリは *_details テーブルを追加するだけで拡張可能 */
enum ItemType {
    STAMP
    EFFECT
    BOOST
    DECORATION
    SUBSCRIPTION
}

/** アイテムが使用可能なシーン。item_scopes で多対多管理 */
enum Scope {
    MATCHING
    BATTLE
    STREAMING
    PROFILE
}

/** エフェクト種別 */
enum EffectType {
    CONFETTI
    FIREWORKS
    HEARTS
    CUSTOM
}

/** ブースト種別 */
enum BoostType {
    MATCH_PRIORITY
    EXTEND_TIME
    SKIP_QUEUE
}

/** コイン取引種別 */
enum TransactionType {
    PURCHASE
    SPEND
    BONUS
    REFUND
}
```

#### 追加するモデル

```prisma
/** 全アイテムの親エンティティ。ショップ表示・所持品・取引履歴の単一参照点 */
model Item {
    id          Int      @id @default(autoincrement())
    type        ItemType
    name        String   @db.VarChar(100)
    description String?  @db.Text
    /** 価格（コイン単位、0=無料） */
    price       Int      @default(0)
    isPremium   Boolean  @default(false) @map("is_premium")
    isActive    Boolean  @default(true) @map("is_active")
    sortOrder   Int      @default(0) @map("sort_order")
    createdAt   DateTime @default(now()) @map("created_at")
    updatedAt   DateTime @updatedAt @map("updated_at")

    scopes             ItemScope[]
    stampDetail        StampDetail?
    effectDetail       EffectDetail?
    boostDetail        BoostDetail?
    inventories        UserInventory[]
    coinTransactions   CoinTransaction[]

    @@index([type, isActive, sortOrder])
    @@map("items")
}

/** アイテムが使用可能なシーンの多対多 join テーブル */
model ItemScope {
    itemId Int   @map("item_id")
    scope  Scope

    item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

    @@id([itemId, scope])
    /** シーン別フィルタ用 B-tree */
    @@index([scope, itemId])
    @@map("item_scopes")
}

/** items.type = STAMP の詳細 */
model StampDetail {
    itemId        Int           @id @map("item_id")
    emoji         String        @db.VarChar(10)
    imageUrl      String?       @map("image_url") @db.VarChar(500)
    animationType AnimationType @default(FLOAT) @map("animation_type")

    item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

    @@map("stamp_details")
}

/** items.type = EFFECT の詳細（将来フェーズ） */
model EffectDetail {
    itemId     Int        @id @map("item_id")
    effectType EffectType @map("effect_type")
    previewUrl String?    @map("preview_url") @db.VarChar(500)
    durationMs Int        @default(3000) @map("duration_ms")

    item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

    @@map("effect_details")
}

/** items.type = BOOST の詳細（将来フェーズ） */
model BoostDetail {
    itemId          Int       @id @map("item_id")
    boostType       BoostType @map("boost_type")
    /** 効果持続時間（秒）。null は即時消費型 */
    durationSeconds Int?      @map("duration_seconds")

    item Item @relation(fields: [itemId], references: [id], onDelete: Cascade)

    @@map("boost_details")
}

/** ユーザーの所持アイテム（将来フェーズ）。items.id への単一 FK で全種別を統一管理 */
model UserInventory {
    id         Int       @id @default(autoincrement())
    userId     Int       @map("user_id")
    itemId     Int       @map("item_id")
    /** 所持数（消費型は >1 になりうる、永続型は常に 1） */
    quantity   Int       @default(1)
    acquiredAt DateTime  @default(now()) @map("acquired_at")
    /** 失効日時（サブスク・期間限定アイテム用、永続型は null） */
    expiresAt  DateTime? @map("expires_at")

    user User @relation(fields: [userId], references: [id], onDelete: Cascade)
    item Item @relation(fields: [itemId], references: [id], onDelete: Restrict)

    @@unique([userId, itemId])
    @@index([userId])
    /** 失効バッチ用 */
    @@index([expiresAt])
    @@map("user_inventory")
}

/** コインの取引履歴（将来フェーズ）。アイテム購入時は relatedItemId で対象を参照 */
model CoinTransaction {
    id            Int             @id @default(autoincrement())
    userId        Int             @map("user_id")
    /** コイン数（正=購入/付与、負=消費） */
    amount        Int
    type          TransactionType
    /** 消費取引のときの対象アイテム（PURCHASE のコイン購入時は null） */
    relatedItemId Int?            @map("related_item_id")
    description   String?         @db.VarChar(255)
    createdAt     DateTime        @default(now()) @map("created_at")

    user        User  @relation(fields: [userId], references: [id], onDelete: Cascade)
    relatedItem Item? @relation(fields: [relatedItemId], references: [id], onDelete: SetNull)

    @@index([userId, createdAt])
    @@index([relatedItemId])
    @@map("coin_transactions")
}
```

#### User モデルへのリレーション追加

`User` モデルの `relations` に以下を追加:

```prisma
inventories      UserInventory[]
coinTransactions CoinTransaction[]
```

### マイグレーション発行

`stamp_masters` の中身は `seed.ts` から再投入できるため、マイグレーションは **drop → create のクリーン構成** にする。Prisma が自動生成する SQL でそのまま受け入れる（手書き SQL 不要）。

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name migrate_stamp_to_items
```

生成された `migration.sql` の冒頭は次のような構造になることを確認する:

```sql
-- DropIndex
DROP INDEX "stamp_masters_category_is_active_sort_order_idx";

-- DropTable
DROP TABLE "stamp_masters";

-- DropEnum
DROP TYPE "StampCategory";

-- CreateEnum
CREATE TYPE "ItemType" AS ENUM ('STAMP', 'EFFECT', 'BOOST', 'DECORATION', 'SUBSCRIPTION');
CREATE TYPE "Scope" AS ENUM ('MATCHING', 'BATTLE', 'STREAMING', 'PROFILE');
CREATE TYPE "EffectType" AS ENUM ('CONFETTI', 'FIREWORKS', 'HEARTS', 'CUSTOM');
CREATE TYPE "BoostType" AS ENUM ('MATCH_PRIORITY', 'EXTEND_TIME', 'SKIP_QUEUE');
CREATE TYPE "TransactionType" AS ENUM ('PURCHASE', 'SPEND', 'BONUS', 'REFUND');

-- CreateTable items / item_scopes / stamp_details / effect_details / boost_details / user_inventory / coin_transactions
...
```

`stamp_masters` の DROP が含まれていれば想定通り。Prisma client を再生成:

```bash
cd apps/api && pnpm prisma generate
```

### seed 更新

`apps/api/src/prisma/seed.ts` の `stampMasters` シードを `items` + `stamp_details` + `item_scopes` に分解する。`StampCategory` の各値は `Scope` に次のとおり対応させる:

| 旧 `StampCategory` | 新 `Scope`（item_scopes に挿入する行） |
|-------------------|--------------------------------------|
| `GENERAL` | `MATCHING` / `BATTLE` / `STREAMING` の3行 |
| `MATCHING` | `MATCHING` 1行 |
| `BATTLE` | `BATTLE` 1行 |

#### 型定義の置き換え

```typescript
import type { AnimationType, ItemType, Scope, TalkThemeCategory, TalkThemeType } from "./generated/enums"

type StampSeed = {
  animationType: AnimationType
  emoji: string
  isPremium: boolean
  name: string
  price: number
  scopes: Scope[]
  sortOrder: number
}
```

#### スタンプシードの書き換え

```typescript
const stamps: StampSeed[] = [
  /** 全シーン共通（旧 GENERAL） */
  { animationType: "FLOAT", emoji: "👏", isPremium: false, name: "拍手", price: 0, scopes: ["MATCHING", "BATTLE", "STREAMING"], sortOrder: 1 },
  { animationType: "FLOAT", emoji: "❤️", isPremium: false, name: "ハート", price: 0, scopes: ["MATCHING", "BATTLE", "STREAMING"], sortOrder: 2 },
  { animationType: "BOUNCE", emoji: "✨", isPremium: false, name: "キラキラ", price: 0, scopes: ["MATCHING", "BATTLE", "STREAMING"], sortOrder: 3 },
  { animationType: "FLOAT", emoji: "🎉", isPremium: false, name: "クラッカー", price: 0, scopes: ["MATCHING", "BATTLE", "STREAMING"], sortOrder: 4 },

  /** バトル専用 */
  { animationType: "EXPLODE", emoji: "🔥", isPremium: false, name: "ファイア", price: 0, scopes: ["BATTLE"], sortOrder: 10 },
  { animationType: "BOUNCE", emoji: "💯", isPremium: false, name: "100点", price: 0, scopes: ["BATTLE"], sortOrder: 11 },
  { animationType: "SHAKE", emoji: "⚡", isPremium: false, name: "稲妻", price: 0, scopes: ["BATTLE"], sortOrder: 12 },
  { animationType: "EXPLODE", emoji: "💥", isPremium: false, name: "爆発", price: 0, scopes: ["BATTLE"], sortOrder: 13 },

  /** マッチング専用 */
  { animationType: "FLOAT", emoji: "😄", isPremium: false, name: "笑顔", price: 0, scopes: ["MATCHING"], sortOrder: 20 },
  { animationType: "FLOAT", emoji: "👍", isPremium: false, name: "いいね", price: 0, scopes: ["MATCHING"], sortOrder: 21 },
  { animationType: "FLOAT", emoji: "🤝", isPremium: false, name: "ナイス", price: 0, scopes: ["MATCHING"], sortOrder: 22 },
]
```

#### upsert 関数

冪等性を保つため、`name` + `type=STAMP` でユニーク照合する。`scopes` は一旦削除して入れ直す。

```typescript
const upsertStamp = async (stamp: StampSeed): Promise<void> => {
  const existing = await prisma.item.findFirst({
    where: { name: stamp.name, type: "STAMP" },
  })

  const itemData = {
    isPremium: stamp.isPremium,
    name: stamp.name,
    price: stamp.price,
    sortOrder: stamp.sortOrder,
    type: "STAMP" as const,
  }
  const stampDetailData = {
    animationType: stamp.animationType,
    emoji: stamp.emoji,
  }

  const persisted = existing
    ? await prisma.item.update({
        data: {
          ...itemData,
          stampDetail: { update: stampDetailData },
        },
        where: { id: existing.id },
      })
    : await prisma.item.create({
        data: {
          ...itemData,
          stampDetail: { create: stampDetailData },
        },
      })

  /** scopes は冪等性のため一旦削除して再投入 */
  await prisma.itemScope.deleteMany({ where: { itemId: persisted.id } })
  await prisma.itemScope.createMany({
    data: stamp.scopes.map((scope) => ({ itemId: persisted.id, scope })),
  })
}
```

#### main() の差し替え

```typescript
console.log("Seeding items (stamps)...")
for (const stamp of stamps) {
  await upsertStamp(stamp)
}
```

旧 `upsertStampMaster` / `stampMasters` の参照は完全に削除する。

## 動作確認

### マイグレーション適用

```bash
cd apps/api
npx dotenvx run -f .env.local -- pnpm prisma migrate dev --name migrate_stamp_to_items
```

`Database is now in sync with your schema` が出力されること。

### シード実行

```bash
npx dotenvx run -f .env.local -- pnpm prisma db seed
```

「Seeding items (stamps)...」が出力され、エラーなく完了すること。

### スキーマの反映を確認

```bash
npx dotenvx run -f .env.local -- pnpm prisma studio
```

Studio で:

- `stamp_masters` テーブルが消えている
- `items` テーブルに 11 件（拍手・ハート・キラキラ・クラッカー・ファイア・100点・稲妻・爆発・笑顔・いいね・ナイス）。すべて `type = STAMP`
- `stamp_details` テーブルに 11 件（`item_id` で `items` と 1対1 対応）
- `item_scopes` テーブル:
  - 全シーン共通スタンプ（4件 × 3 scope = 12 行）
  - バトル専用スタンプ（4件 × 1 scope = 4 行）
  - マッチング専用スタンプ（3件 × 1 scope = 3 行）
  - 合計 19 行
- `effect_details` / `boost_details` / `user_inventory` / `coin_transactions` テーブルが空で存在
- enum: `ItemType` / `Scope` / `EffectType` / `BoostType` / `TransactionType` が存在、`StampCategory` が消えている

### TypeScript / ビルド

```bash
cd apps/api && pnpm build
```

`StampMaster` / `StampCategory` を参照している既存コードがあれば（現時点では `seed.ts` のみ）、本 step で全て削除済みであることを確認。

### 既存テスト実行

```bash
cd apps/api && pnpm test
```

スタンプ関連の Service/Controller はまだ未実装のため、本 step での新規テストは無し。Phase 0 から続く既存テスト（auth / user）が引き続きグリーンであること。

### CI 用テスト

```bash
pnpm test:ci
```

`prisma migrate deploy` が通ること（クリーン DB に対してマイグレーションが適用できる冪等性）。

## 既知の未対応 / 後続 step に持ち越し

- `GET /api/items` / `GET /api/items/:id` 等のアイテム取得 API は Phase 4 マッチング実装時に必要分だけ追加（マッチングのスタンプパレット用）
- `POST /api/items/:id/purchase` / `GET /api/me/inventory` 等の課金 API は Phase 9（Spec6）
- Admin アイテム管理画面は Phase 9
- `EffectDetail` / `BoostDetail` のシードは現時点では空のまま（Phase 9 で投入）
