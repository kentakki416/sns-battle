# step10-web-matching-lobby.md

`/matching` マッチングロビーページを実装する。待機中ユーザー一覧と「マッチング開始」CTA を表示。CTA クリックで `/matching/session` へ遷移し、そこで `POST /api/matching/join` が実行される（join はセッションページ側で行う）。

UI 仕様は `docs/spec/matching/README.md` の [マッチングロビー](./README.md#マッチングロビーmatching) を参照。AppShell の **default モード**（ナビバー + サイドバー）。

依存: step1〜3（join/leave/status と SSE）、Phase 2（AppShell / Navbar / Sidebar）、Phase 3（getCurrentUser）。

## 仕様

- 認証必須。未ログインは `/sign-in`、未オンボーディングは `/onboarding` リダイレクト
- 待機ユーザー一覧（自分を除く）を表示
- 「マッチング開始」CTA → `/matching/session` へ Link 遷移
- 「フィルター設定」ボタンは `Coming Soon`（disabled なし表示、クリック不可）
- 待機ユーザー一覧の取得: 新エンドポイント `GET /api/matching/queue`（status=WAITING の全ユーザーを返す）を追加するか、既存 `/api/matching/status` を全体取得モードに拡張
- **本 step の範囲では新エンドポイントを追加せず、SSE で更新される一覧データは将来検討**。初期版は静的に空の状態 + 自分が未待機なら「まだマッチング待機中のユーザーはいません」と表示

## 対応内容

### Step 0: before スクショ（既存ページ修正なら必要 / 本ページは新規作成のため不要）

`/matching` は新規ページなので before スクショは撮影不要。skill のフローに従い `verify-web-page` skill の Step 1 から開始。

### ファイル構成

```
apps/web/src/app/matching/
├── page.tsx                    ← Server Component
└── _components/
    ├── MatchingHero.tsx        ← Client（タイトル + CTA）
    ├── WaitingUserCard.tsx     ← Client（個別カード）
    └── WaitingUserGrid.tsx     ← Client（グリッド + パルス）
```

既存 `/matching/preferences` は配下にあるためルーティング上の競合はない（Next.js は同階層に `page.tsx` と `preferences/page.tsx` を共存できる）。

### `page.tsx`

```typescript
import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

import { MatchingHero } from "./_components/MatchingHero"
import { WaitingUserGrid } from "./_components/WaitingUserGrid"

export const metadata: Metadata = { title: "マッチング | SNS Battle" }

export default async function MatchingLobbyPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  /** 初期版は空配列。将来 GET /api/matching/queue で取得 */
  const waitingUsers: never[] = []

  return (
    <main className="relative mx-auto max-w-4xl p-6">
      <MatchingHero />
      <WaitingUserGrid users={waitingUsers} />
    </main>
  )
}
```

### `MatchingHero.tsx`

仕様書の [マッチングロビー - レイアウト](./README.md#マッチングロビーmatching) に沿って実装:

- ヘッダー（h1: "🤝 マッチング" + サブテキスト）
- マッチング開始 CTA（3 点グラデ + アニメ背景 + ホバーで scale）
  - `<Link href="/matching/session">` で遷移
- フィルター設定ボタン（Coming Soon、`text-text-muted`）

`gradient-shift` keyframe を `globals.css` に追加:

```css
@keyframes gradient-shift {
  0%, 100% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
}
```

### `WaitingUserGrid.tsx`

- セクションヘッダ「マッチング待機中」 + 緑バッジで人数 + パルスドット
- 0 件なら `text-text-disabled` で「まだマッチング待機中のユーザーはいません」
- 1 件以上なら `WaitingUserCard` を grid 表示

### `WaitingUserCard.tsx`

- 仕様書通り 56px アバター + 名前 + 年齢/性別 + 待機中ドット
- Framer Motion で `delay: 0.4 + i * 0.05` の順次 fade in
- 型は将来の `GET /api/matching/queue` レスポンスに合わせて `{ id, name, avatar_url, age, gender }`

## 動作確認

### Lint / Build

```bash
cd apps/web && pnpm lint:fix && pnpm build
```

`/matching` がルートに登録されること。

### Playwright MCP（必須）

`verify-web-page` skill に従う:

1. dev サーバ起動確認
2. cookie 注入
3. `/matching` 遷移 → console error 0
4. 主要要素確認: 「🤝 マッチング」見出し、「マッチング開始」CTA、「フィルター設定」（Coming Soon）、待機 0 件メッセージ
5. `docs/screenshots/matching-lobby/after.png` に保存
6. 新規ページのため before なし

### 既存ページへの影響

- Phase 2 step3 の Sidebar に `/matching` リンクが既にある想定。リンク先が機能することを確認

## 既知の未対応 / 後続 step に持ち越し

- 待機ユーザー一覧の動的取得（`GET /api/matching/queue` 新設 + SSE で更新）は将来 step
- フィルター設定の UI 連携（`/matching/preferences` への Link を上に追加するか、ロビー上で簡易フィルタを表示するか）は将来検討
