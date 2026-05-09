# step12-web-matching-result.md

`/matching/result` 結果ページを実装する。10 ラウンドの一致／不一致を一覧表示。`session_id` クエリパラメータで対象セッションを指定。

UI 仕様は `docs/spec/matching/README.md` の [マッチング結果](./README.md#マッチング結果matchingresult) を参照。AppShell の **default モード**。

依存: step5（GET sessions/:id）、step6（GET sessions/:id/reactions）。

## 仕様

- 認証必須。is_onboarded=false → /onboarding リダイレクト
- クエリ: `?session_id=N`、必須。なければ /matching へリダイレクト
- セッション参加者でない → 403 表示
- 「フォローする」ボタンは Phase 5（social）の `POST /api/users/:id/follow` を呼ぶ。Phase 5 未実装なら disabled + Coming Soon
- 「ホームに戻る」は `<Link href="/">`

## 対応内容

### ファイル構成

```
apps/web/src/app/matching/result/
├── page.tsx                    ← Server Component
└── _components/
    ├── ResultHeader.tsx        ← Client（成立アバター + 一致数）
    ├── RoundList.tsx           ← Client（10 ラウンドのカード一覧）
    └── ResultActions.tsx       ← Client（ホームに戻る / フォローする）
```

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getMatchingSessionResponseSchema, getReactionsResponseSchema } from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"
import { getCurrentUser } from "@/libs/current-user"

import { ResultActions } from "./_components/ResultActions"
import { ResultHeader } from "./_components/ResultHeader"
import { RoundList } from "./_components/RoundList"

type Props = { searchParams: Promise<{ session_id?: string }> }

export default async function MatchingResultPage({ searchParams }: Props) {
  const { session_id } = await searchParams
  const sessionId = Number(session_id)
  if (!Number.isInteger(sessionId) || sessionId <= 0) redirect("/matching")

  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  const [sessionJson, reactionsJson] = await Promise.all([
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}`),
    apiClient.get<unknown>(`/api/matching/sessions/${sessionId}/reactions`),
  ])
  const session = getMatchingSessionResponseSchema.parse(sessionJson)
  const { rounds } = getReactionsResponseSchema.parse(reactionsJson)
  const peer = session.is_self_user1 ? session.user2 : session.user1
  const matchCount = rounds.filter((r) => r.is_match).length

  return (
    <div className="relative mx-auto max-w-lg px-6 py-8">
      <ResultHeader matchCount={matchCount} peer={peer} totalRounds={rounds.length} />
      <RoundList rounds={rounds} />
      <ResultActions peerId={peer.id} />
    </div>
  )
}
```

### `ResultHeader.tsx`

仕様書通り:
- 中央ハート（spring scale: 0 → 1）
- 自分（左）+ 相手（右）アバター（80px、glow-border）
- 一致数表示（5xl bold グラデ）

### `RoundList.tsx`

```typescript
type Props = { rounds: GetReactionsResponse["rounds"] }

export function RoundList({ rounds }: Props) {
  return (
    <div className="mt-6 space-y-2 rounded-2xl border border-dark-border bg-dark-surface/60 p-4 backdrop-blur">
      {rounds.map((r) => (
        <div
          className={[
            "flex items-center gap-3 rounded-xl border px-3 py-2.5",
            r.is_match ? "border-primary/30 bg-primary/[0.05]" : "border-dark-border bg-white/[0.02]",
          ].join(" ")}
          key={r.round_number}
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs font-bold">
            {r.round_number}
          </span>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm text-white">{r.theme.title}</p>
            <p className="text-xs text-text-muted">
              あなた: {r.my_choice?.label ?? "-"}　相手: {r.peer_choice?.label ?? "-"}
            </p>
          </div>
          <span className="text-lg">{r.is_match ? "🎉" : "✕"}</span>
        </div>
      ))}
    </div>
  )
}
```

### `ResultActions.tsx`

```typescript
"use client"
import Link from "next/link"

type Props = { peerId: number }

export function ResultActions({ peerId }: Props) {
  return (
    <div className="mt-6 flex items-center gap-3">
      <Link
        className="h-11 flex-1 rounded-xl border border-dark-border px-6 py-3 text-center text-sm text-text-muted transition hover:text-white"
        href="/"
      >
        ホームに戻る
      </Link>
      <button
        className="h-11 flex-1 rounded-xl text-sm font-semibold text-dark-base disabled:opacity-50"
        disabled
        style={{ background: "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)" }}
        type="button"
      >
        フォローする（Coming Soon）
      </button>
    </div>
  )
}
```

Phase 5 でフォロー API が実装されたら disabled 解除 + onClick で `POST /api/users/{peerId}/follow` を呼ぶ。

## 動作確認

### Step 0: before スクショ

新規ページのため不要。

### Lint / Build

```bash
cd apps/web && pnpm lint:fix && pnpm build
```

`/matching/result` がルートに登録されること。

### Playwright MCP（必須）

`verify-web-page` skill のフロー:

1. dev サーバ起動確認
2. cookie 注入
3. テスト用 MatchingSession + MatchingReaction を DB に直接投入（`pnpm db:studio` or SQL）
4. `/matching/result?session_id=N` 遷移 → console error 0
5. 主要要素確認: タイトル「マッチング終了!」、ピアアバター、一致数表示、10 round カード、ホーム / フォローボタン
6. `docs/screenshots/matching-result/after.png` に保存

### 不正な session_id

- `/matching/result`（クエリなし）→ `/matching` に redirect
- `/matching/result?session_id=abc` → redirect
- 存在しない id → API が 404 → `notFound()`
- 自分が参加者でない → API が 403 → エラー画面

## 既知の未対応 / 後続 step に持ち越し

- 紙吹雪エフェクト（一致時）の演出は `<ConfettiEffect>` を必要に応じて呼び出すが、結果画面ではシンプルに 🎉 アイコンのみ
- 「フォローする」の活性化は Phase 5（social）で対応
- 結果画面からのブロック / 通報メニューは将来検討
