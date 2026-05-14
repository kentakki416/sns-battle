# step1-db-talk-theme-score-range.md

`talk_themes` に MBTI 相性スコア帯のカラム 2 つを追加し、seed を更新する。

依存: なし（Phase 4 までで `talk_themes` テーブルは作成済み）。

## 対応内容

### Prisma schema 変更

`apps/api/src/prisma/schema.prisma` の `model TalkTheme` に 2 カラム追加（既存カラムのアルファベット順に従って挿入する）:

```prisma
model TalkTheme {
    id        Int               @id @default(autoincrement())
    title     String            @db.VarChar(255)
    type      TalkThemeType
    category  TalkThemeCategory @default(MATCHING)
    duration  Int               @default(20)
    sortOrder Int               @default(0) @map("sort_order")
    isActive  Boolean           @default(true) @map("is_active")

    /// MBTI 相性スコア（0..100）の推奨帯。両方 null = 全帯域 OK
    /// 抽選条件: (target_score_min ?? 0) <= score <= (target_score_max ?? 100)
    targetScoreMin Int? @map("target_score_min")
    targetScoreMax Int? @map("target_score_max")

    createdAt DateTime          @default(now()) @map("created_at")
    updatedAt DateTime          @updatedAt @map("updated_at")

    choices   TalkThemeChoice[]
    reactions MatchingReaction[]

    @@index([category, isActive, sortOrder])
    @@map("talk_themes")
}
```

`apps/api/CLAUDE.md` の comment style に従い `///` Prisma コメントは複数行 / `/** */` ではなく Prisma の docstring を使う（既存カラムの書き方に合わせる）。

### Migration

`apps/api` ディレクトリで:

```bash
pnpm prisma migrate dev --name phase6_talk_themes_score_range
```

生成された SQL に **CHECK 制約 2 本を手書き追加** する（Prisma の宣言的サポート外のため、生成された `migration.sql` の末尾に SQL を追記）:

```sql
ALTER TABLE "talk_themes"
  ADD COLUMN "target_score_min" INTEGER,
  ADD COLUMN "target_score_max" INTEGER;

ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_min_range"
    CHECK ("target_score_min" IS NULL OR ("target_score_min" >= 0 AND "target_score_min" <= 100));

ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_max_range"
    CHECK ("target_score_max" IS NULL OR ("target_score_max" >= 0 AND "target_score_max" <= 100));

ALTER TABLE "talk_themes"
  ADD CONSTRAINT "talk_themes_target_score_min_le_max"
    CHECK (
      "target_score_min" IS NULL
      OR "target_score_max" IS NULL
      OR "target_score_min" <= "target_score_max"
    );
```

`pnpm prisma migrate dev` 実行時に Prisma が自動生成した部分を残しつつ、上記の `ADD CONSTRAINT` ブロックを追記して再実行する（または `migrate dev --create-only` で SQL を編集してから `migrate dev`）。

### Seed の更新

`apps/api/src/prisma/seed.ts` の `TalkThemeSeed` 型と `talkThemes` 配列を更新:

```typescript
type TalkThemeSeed = {
  category: TalkThemeCategory
  choices: TalkThemeChoiceSeed[]
  duration: number
  sortOrder: number
  /** 推奨スコア下限（包含）。null = 下限なし */
  targetScoreMax: number | null
  /** 推奨スコア上限（包含）。null = 上限なし */
  targetScoreMin: number | null
  title: string
  type: TalkThemeType
}
```

既存テーマは全て `targetScoreMin: null, targetScoreMax: null` のままで OK（互換維持）。

加えて HIGH 帯 / LOW 帯のテーマを **各 type に最低 1 件ずつ** 追加する。値は運用しながらチューニング前提のドラフト値:

```typescript
const talkThemes: TalkThemeSeed[] = [
  /** 既存テーマ（全て targetScoreMin/Max = null） */
  /** MATCHING - CHOICE */
  { category: "MATCHING", choices: [...], duration: 20, sortOrder: 1, targetScoreMax: null, targetScoreMin: null, title: "好きな食べ物のジャンルは？", type: "CHOICE" },
  /** ... 既存テーマ ... */

  /** ▼▼ Phase 6 追加 ▼▼ */

  /** LOW 帯（57..69）: 緊張をほぐす軽めの CHOICE */
  {
    category: "MATCHING",
    choices: [
      { emoji: "☕", label: "コーヒー", sortOrder: 1 },
      { emoji: "🍵", label: "お茶", sortOrder: 2 },
      { emoji: "🥤", label: "ジュース", sortOrder: 3 },
      { emoji: "🍺", label: "お酒", sortOrder: 4 },
    ],
    duration: 20,
    sortOrder: 50,
    targetScoreMax: 69,
    targetScoreMin: 0,
    title: "今飲みたいのは？",
    type: "CHOICE",
  },
  /** LOW 帯: 軽めの FREE_TALK */
  {
    category: "MATCHING",
    choices: [],
    duration: 30,
    sortOrder: 51,
    targetScoreMax: 69,
    targetScoreMin: 0,
    title: "最近食べた美味しいものを教えて",
    type: "FREE_TALK",
  },

  /** HIGH 帯（85..100）: 価値観に踏み込む CHOICE */
  {
    category: "MATCHING",
    choices: [
      { emoji: "💼", label: "仕事", sortOrder: 1 },
      { emoji: "❤️", label: "恋愛", sortOrder: 2 },
      { emoji: "🌱", label: "成長", sortOrder: 3 },
      { emoji: "🎨", label: "趣味", sortOrder: 4 },
    ],
    duration: 20,
    sortOrder: 60,
    targetScoreMax: 100,
    targetScoreMin: 85,
    title: "今、人生で一番大切なものは？",
    type: "CHOICE",
  },
  /** HIGH 帯: 深い FREE_TALK */
  {
    category: "MATCHING",
    choices: [],
    duration: 30,
    sortOrder: 61,
    targetScoreMax: 100,
    targetScoreMin: 85,
    title: "心に残っている言葉やフレーズを教えて",
    type: "FREE_TALK",
  },
]
```

`upsertTalkTheme` の中で `targetScoreMin` / `targetScoreMax` も `data` に含める:

```typescript
const data = {
  category: theme.category,
  duration: theme.duration,
  sortOrder: theme.sortOrder,
  targetScoreMax: theme.targetScoreMax,
  targetScoreMin: theme.targetScoreMin,
  title: theme.title,
  type: theme.type,
}
```

ESLint の sort-keys ルールに従い、フィールドはアルファベット順に並べる（既存の `data` ブロックと同じスタイル）。

### Prisma client 再生成

```bash
cd apps/api && pnpm prisma generate
```

apps/matching-worker 側の generate は次 step で行う（schema 共有方針による）。

## 動作確認

### Migration が通る

```bash
cd apps/api
pnpm prisma migrate dev --name phase6_talk_themes_score_range
pnpm prisma migrate status   # up-to-date
```

### Seed が通り、データが入っている

```bash
cd apps/api
pnpm prisma db seed
```

`psql` で確認:

```sql
SELECT id, title, type, target_score_min, target_score_max
FROM talk_themes
WHERE category = 'MATCHING'
ORDER BY sort_order;
```

- 既存テーマは `target_score_min` / `target_score_max` が共に `NULL`
- 追加した LOW 帯 / HIGH 帯テーマがそれぞれ 2 件ずつ（CHOICE と FREE_TALK で計 4 件）入っている

### CHECK 制約が効く

```sql
-- 範囲外 → 失敗するはず
UPDATE talk_themes SET target_score_min = -1 WHERE id = 1;
UPDATE talk_themes SET target_score_max = 101 WHERE id = 1;
UPDATE talk_themes SET target_score_min = 50, target_score_max = 40 WHERE id = 1;
```

いずれも `ERROR: new row for relation "talk_themes" violates check constraint` で reject されることを確認。

### apps/api のテスト

`pnpm test`（apps/api）が通ること。`talk_themes` を参照する既存テストが落ちないことを確認。新たな専用テストはこの step では不要（DB スキーマ追加のみ）。
