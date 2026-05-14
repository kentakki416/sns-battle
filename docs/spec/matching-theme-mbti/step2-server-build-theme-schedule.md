# step2-server-build-theme-schedule.md

`apps/matching-worker` の `buildThemeSchedule` を MBTI 相性スコア対応に拡張し、`advance-theme` ジョブで両ユーザーの MBTI を引いてスコアを算出する経路を組む。

依存: step1（`talk_themes.target_score_min/max` カラム追加 + seed 更新）。

## 対応内容

### Prisma client の再生成（worker 側）

worker 側でも新カラムを認識させるため、`apps/matching-worker` の `db:generate` を実行する（既存スクリプトを利用）:

```bash
cd apps/matching-worker
pnpm db:generate
```

`apps/matching-worker/src/client/prisma.ts` 経由で参照している `PrismaClient` の型に `targetScoreMin` / `targetScoreMax` が含まれることを確認。

### Domain 型の拡張

`apps/matching-worker/src/types/domain/talk-theme.ts`（既存）の `TalkTheme` ドメイン型に 2 フィールドを追加:

```typescript
export type TalkTheme = {
    category: TalkThemeCategory
    duration: number
    id: number
    isActive: boolean
    sortOrder: number
    targetScoreMax: number | null
    targetScoreMin: number | null
    title: string
    type: TalkThemeType
}
```

`TalkThemeWithChoices` は既存通り（choices 込みの構造体）。`_toTheme` の戻り値に新フィールドを含めるよう、後段の Repository を更新する。

### Repository: `TalkThemeRepository` の `_toTheme` を更新

`apps/matching-worker/src/repository/prisma/talk-theme-repository.ts` の `_toTheme` に追加:

```typescript
private _toTheme(row: ThemeWithChoicesRow | PrismaTypes.TalkThemeGetPayload<{}>): TalkTheme {
  return {
    category: row.category,
    duration: row.duration,
    id: row.id,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    targetScoreMax: row.targetScoreMax,
    targetScoreMin: row.targetScoreMin,
    title: row.title,
    type: row.type,
  }
}
```

`findActiveByCategoryAndType` / `findByIdWithChoices` の SQL 自体は変更不要（`findMany` / `findUnique` が新カラムも自動で返す）。

### Repository: `MatchingSessionRepository` に MBTI 取得メソッドを追加

`apps/matching-worker/src/repository/prisma/matching-session-repository.ts` の interface と class に `findByIdWithUserMbtis` を追加:

```typescript
export type MatchingSessionWithUserMbtis = {
    session: MatchingSession
    user1Mbti: string | null
    user2Mbti: string | null
}

export interface MatchingSessionRepository {
    findById(id: number): Promise<MatchingSession | null>
    /**
     * セッションと両参加者の MBTI 値をまとめて取得する。
     * worker の advance-theme ジョブで schedule 生成時に相性スコアを算出するために使う。
     */
    findByIdWithUserMbtis(id: number): Promise<MatchingSessionWithUserMbtis | null>
    markEnded(id: number, endReason: MatchingEndReason): Promise<MatchingSession>
}
```

実装:

```typescript
async findByIdWithUserMbtis(id: number): Promise<MatchingSessionWithUserMbtis | null> {
  const row = await this._prisma.matchingSession.findUnique({
    include: {
      user1: { select: { mbti: true } },
      user2: { select: { mbti: true } },
    },
    where: { id },
  })
  if (!row) return null
  return {
    session: this._toDomain(row),
    user1Mbti: row.user1.mbti,
    user2Mbti: row.user2.mbti,
  }
}
```

`MatchingSession` リレーション名（`user1` / `user2`）が apps/api 側 schema と異なる場合は、`apps/api/src/prisma/schema.prisma` の `MatchingSession` model を確認して合わせる。

### Lib: MBTI 相性計算を worker 側に移植

`apps/matching-worker/src/lib/mbti.ts`（新規）として `apps/api/src/lib/mbti.ts` の `calculateMbtiCompatibility` をそのままコピーする。重複コードになるが、本フェーズでは `packages/` 切り出しは行わずに進める（README の「既知の未対応」に記載済み）。

`apps/matching-worker/CLAUDE.md` が無ければ comment style / function style は ESLint 共通ルール（`const` + アロー）に合わせる。

### `buildThemeSchedule` の拡張

`apps/matching-worker/src/jobs/build-theme-schedule.ts` を以下の方針で改修:

- 関数シグネチャを `(deps, options?: { mbtiCompatibility: number | null })` に変更（後方互換を取りつつ、テストから直接呼ぶ既存ユニットテストの引数を最小変更で吸収）
- 各 round の `type`（FREE_TALK / CHOICE）を決めた後、その type 内で:
  1. `mbtiCompatibility` が `null` → 全テーマプールを使う（既存挙動）
  2. `mbtiCompatibility` がある → `(target_score_min ?? 0) <= score <= (target_score_max ?? 100)` で **絞り込んだプール** を使う
  3. 絞り込み結果が空（その type に該当帯のテーマが 1 件もない）→ 全テーマプールにフォールバック
- フィルタしたプール内で `shuffle` → modulo で round に割り当てる既存ロジックを保つ

参考コード:

```typescript
import { calculateMbtiCompatibility } from "../lib/mbti"
import type { TalkTheme } from "../types/domain"
import type { TalkThemeRepository } from "../repository/prisma"

type BuildThemeScheduleOptions = {
    mbtiCompatibility: number | null
}

const filterByScore = (themes: TalkTheme[], score: number | null): TalkTheme[] => {
  if (score === null) return themes
  return themes.filter((t) => {
    const min = t.targetScoreMin ?? 0
    const max = t.targetScoreMax ?? 100
    return score >= min && score <= max
  })
}

export const buildThemeSchedule = async (
  deps: { talkThemeRepository: TalkThemeRepository },
  options: BuildThemeScheduleOptions = { mbtiCompatibility: null },
): Promise<ScheduleEntry[]> => {
  const [choiceThemes, freeTalkThemes] = await Promise.all([
    deps.talkThemeRepository.findActiveByCategoryAndType("MATCHING", "CHOICE"),
    deps.talkThemeRepository.findActiveByCategoryAndType("MATCHING", "FREE_TALK"),
  ])
  if (choiceThemes.length === 0 || freeTalkThemes.length === 0) {
    throw new Error(
      `Cannot build theme schedule: choice=${choiceThemes.length}, free=${freeTalkThemes.length}`,
    )
  }

  /** スコア帯でフィルタした優先プール。空なら全帯域プールにフォールバック */
  const filteredChoice = filterByScore(choiceThemes, options.mbtiCompatibility)
  const filteredFree = filterByScore(freeTalkThemes, options.mbtiCompatibility)
  const c = shuffle(filteredChoice.length > 0 ? filteredChoice : choiceThemes)
  const f = shuffle(filteredFree.length > 0 ? filteredFree : freeTalkThemes)

  const result: ScheduleEntry[] = []
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const isFreeTalk = i % 2 === 0
    const theme = isFreeTalk ? f[i % f.length] : c[i % c.length]
    result.push({
      durationSeconds: theme.duration,
      speakerUserKey: i % 2 === 0 ? "user1" : "user2",
      themeId: theme.id,
    })
  }
  return result
}
```

ESLint `sort-keys` の例外（`id` 先頭、`createdAt/updatedAt` 末尾）に従い、type / interface の key 順は既存ファイルに合わせる。

### `advance-theme` ジョブの改修

`apps/matching-worker/src/jobs/advance-theme.ts` の schedule 生成箇所（既存の `else` ブロック）を、両ユーザーの MBTI 取得 + score 算出 + `buildThemeSchedule` への伝播 に置き換える:

```typescript
import { calculateMbtiCompatibility } from "../lib/mbti"

// ...

let schedule: ScheduleEntry[]
if (cached) {
  schedule = JSON.parse(cached) as ScheduleEntry[]
} else {
  const sessionWithMbtis =
    await deps.matchingSessionRepository.findByIdWithUserMbtis(data.sessionId)
  const mbtiCompatibility = sessionWithMbtis
    ? calculateMbtiCompatibility(sessionWithMbtis.user1Mbti, sessionWithMbtis.user2Mbti)
    : null

  schedule = await buildThemeSchedule(
    { talkThemeRepository: deps.talkThemeRepository },
    { mbtiCompatibility },
  )
  await deps.redis.set(key, JSON.stringify(schedule), "EX", SCHEDULE_TTL_SECONDS)

  logger.info(
    { mbtiCompatibility, sessionId: data.sessionId },
    "[advance-theme] schedule built",
  )
}
```

`session` 自体は冒頭の `findById` ですでに取得済みなので、`findByIdWithUserMbtis` の呼び出しは「schedule を新規生成する round=1 のときだけ」に限定される（冪等性とコストの両立）。

`AdvanceThemeDeps` の型変更は不要（既存 `matchingSessionRepository` の interface 拡張のみで吸収できる）。

### Worker への DI 配線

`apps/matching-worker/src/index.ts`（または `src/workers/theme-progress-worker.ts`）の DI 配線は変更不要（既存の `PrismaMatchingSessionRepository` のインスタンスが拡張 interface もそのまま満たす）。

## 動作確認

### Unit テスト: `buildThemeSchedule`

既存の `apps/matching-worker/test/jobs/build-theme-schedule.test.ts` に以下のケースを追加（既存ファイルが無い場合は新規）:

| ケース | 期待結果 |
|---|---|
| `mbtiCompatibility = null` | 全テーマプールから選ばれる（既存挙動と同じ） |
| `mbtiCompatibility = 60`（LOW 帯） | `targetScoreMin <= 60 <= targetScoreMax` を満たすテーマだけが round に並ぶ。両 null のテーマも含まれる |
| `mbtiCompatibility = 90`（HIGH 帯） | 同上、score=90 を満たすテーマだけ |
| `mbtiCompatibility = 80` で HIGH 帯テーマのみ存在する type がある場合 | 該当 type は **フォールバック** で全帯域プールから選ばれる |

`talkThemeRepository` は `jest.fn()` で mock。固定配列（両 null、LOW 帯 = 0..69、HIGH 帯 = 85..100 の 3 種を各 type で用意）を返すスタブを構築する。

### Unit テスト: `calculateMbtiCompatibility`（worker 側）

`apps/matching-worker/test/lib/mbti.test.ts`（新規）に最低限の境界テストを追加（apps/api 側のテストをコピーで可）:

| ケース | 期待結果 |
|---|---|
| 両者 null | `null` |
| 片方 null | `null` |
| 不正形式（"ABCD" など） | `null` |
| `INTJ` × `ENFP` | 100（既存仕様通り） |
| `INTJ` × `INTJ` | 既存仕様通りの値 |

### Integration テスト: `advance-theme`

`apps/matching-worker/test/jobs/advance-theme.test.ts` に以下のケースを追加:

| ケース | 期待結果 |
|---|---|
| 両ユーザー MBTI null | `findByIdWithUserMbtis` 経由で null/null を取得、`buildThemeSchedule` に `mbtiCompatibility: null` が渡る。schedule は既存挙動 |
| 両ユーザー MBTI セット（INTJ × ENFP = 100） | `buildThemeSchedule` に `mbtiCompatibility: 100` が渡る。HIGH 帯テーマが優先される |
| schedule が既に Redis にある | `findByIdWithUserMbtis` は **呼ばれない**（cache 経路） |

`MatchingSessionRepository` と `TalkThemeRepository` は `jest.fn()` で stub。`buildThemeSchedule` 自体は本物の関数を使い、`mbtiCompatibility` 引数の伝播を検証する。

### dev で疎通

```bash
pnpm --filter api dev
pnpm --filter matching-worker dev
```

1. apps/admin or 直接 DB で test ユーザー 2 名の `mbti` をセット（例: `INTJ` / `ENFP` で相性 100）
2. 2 名で `/api/matching/join` → match 成立
3. `POST /api/matching/sessions/:id/start`
4. matching-worker のログで `[advance-theme] schedule built` に `mbtiCompatibility=100` が出ていること
5. Web 側でテーマが HIGH 帯（「今、人生で一番大切なものは？」「心に残っている言葉やフレーズを教えて」）から優先的に流れていること
6. 別ユーザーペアで mbti を null のままにし、既存ランダム挙動に戻ることを確認

## 既知の未対応 / 後続 step に持ち越し

- `apps/api/src/lib/mbti.ts` と `apps/matching-worker/src/lib/mbti.ts` の重複は `packages/mbti` 切り出しで解消予定（本 step では対応しない）
- Admin での `target_score_min/max` 編集 UI（運用しながら必要になったら）
- スコア帯と実セッションのリアクション率を突き合わせて自動チューニングする学習ループ
- BATTLE カテゴリへの適用（本 step は MATCHING のみ）
