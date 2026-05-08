---
name: verify-web-page
description: フロントエンド（apps/web、apps/admin）の実装・修正後に Playwright MCP で実画面の動作確認を行う skill。dev サーバの起動確認、認証必須ページへの JWT cookie 注入、navigate / console_messages / snapshot による検証手順を標準化する。`pnpm build` だけで「動作確認済み」と報告するのは禁止であり、UI コードを書いたら必ずこの skill を実行する。ユーザーが「動作確認して」「画面で確認して」「ちゃんと動くか」と尋ねた場合、または UI 実装直後に自発的に呼び出す。
---

# verify-web-page

UI コードを書いた直後に **必ず** 実行する動作確認 skill。`pnpm build` の通過は型・ルート登録のチェックでしかなく、実際のレンダリング不具合・コンソールエラー・認証フローは検出できない。

## 対象

- `apps/web`（port 3000）
- `apps/admin`（port 3030）— Admin 認証は将来実装。現状はそのまま navigate

## 進め方

### Step 1: dev サーバの起動確認

```bash
curl -s -o /dev/null -w "web=%{http_code} api=%{http_code}\n" http://localhost:3000 -o /dev/null && \
curl -s http://localhost:8080/api/health
```

- web が 200 / 307（middleware redirect） を返す
- api の `/api/health` が `{"status":"ok"}` を返す

両方走っていない場合: ユーザーに「`pnpm dev` を起動してください」と伝える。勝手に `pnpm dev` を `run_in_background` で立ち上げない（既存セッションと競合するリスク）。

### Step 2: 検証対象ページの認証要否を確認

| 認証要否 | 例 | 手順 |
|----------|------|------|
| 不要（PUBLIC_PATHS） | `/sign-in` | そのまま `browser_navigate` |
| 必要 | `/`, `/onboarding`, `/profile/:id`, `/matching/preferences` 等 | Step 3 で cookie を注入 |

`apps/web/src/middleware.ts` の `PUBLIC_PATHS` を見て判定する。

### Step 3: 認証必須ページの場合 — JWT を発行して cookie 注入

#### 3-1. テスト用ユーザーの id を確認

dev DB のユーザー一覧を Prisma Studio または DB 直結で確認する:

```bash
docker exec -i sns-battle-postgres psql -U postgres -d "sns-battle_dev" -At -c \
  "SELECT id, name, is_onboarded FROM users ORDER BY id LIMIT 10"
```

ユーザーがいない、もしくは `is_onboarded=false` で `/onboarding` 以外のページを検証したい場合、**テストデータ作成のために dev サーバ上で API を叩いて user を作るか、SQL で is_onboarded=true に更新する**。

例: 既存 user 1 をオンボーディング済にする:

```bash
docker exec -i sns-battle-postgres psql -U postgres -d "sns-battle_dev" -c \
  "UPDATE users SET is_onboarded=true, name='Test', birth_date='1995-05-15', gender='MALE' WHERE id=1"
```

#### 3-2. JWT を発行

```bash
cd apps/api && pnpm issue-test-token <userId>
# 例: pnpm issue-test-token 1
```

`{"access":"...","refresh":"...","userId":1}` が出力される。**access_token は 15 分しか有効でない** ため、検証セッションが長引いたら再発行する。

> Refresh token は Redis に登録していないため、apiClient の自動 refresh は走らない。access が切れたら再発行 → 再注入する想定。

#### 3-3. Playwright に cookie を注入

```js
mcp__playwright__browser_evaluate({
  function: `() => {
    document.cookie = "sb_access_token=<ACCESS>; path=/; max-age=900";
    document.cookie = "sb_refresh_token=<REFRESH>; path=/; max-age=604800";
  }`
})
```

Cookie 名は `apps/web/src/libs/auth.ts` の `ACCESS_TOKEN_COOKIE` / `REFRESH_TOKEN_COOKIE` 定数（`sb_access_token` / `sb_refresh_token`）。

> 本番では `httpOnly: true` で設定されるが、検証用にブラウザ側 `document.cookie` で設定する。Server Component から `cookies()` で読めれば middleware を通過する。

注入後にもう一度 `browser_navigate` で目的のページに遷移する（cookie 設定だけでは画面は再描画されない）。

### Step 4: ページの検証

```js
mcp__playwright__browser_navigate({ url: "http://localhost:3000/profile/1" })
mcp__playwright__browser_console_messages({ level: "error" })
mcp__playwright__browser_snapshot({})
```

合格条件:

1. **`browser_navigate` が目的の URL のままで完了**（Step 2 の認証必須ページが `/sign-in?redirect=...` に飛んでいないこと）
2. **`browser_console_messages` の `level: "error"` が 0 件**
3. **`browser_snapshot` で意図した要素が見える**（仕様書で定義した見出し / フォーム項目 / アクションボタン等）

### Step 5: スクリーンショット（任意）

ユーザーへの報告 / 仕様書貼付が必要な場合のみ:

```js
mcp__playwright__browser_take_screenshot({
  type: "png",
  filename: "step8-profile-view.png",
  fullPage: true,
})
```

`docs/spec/{feature}/` に貼る場合は `design-mock` skill のフローを併用する。

### Step 6: エラーがあれば修正してループ

- console error が出ている → 該当箇所のソースを Read してエラー原因を特定 → 修正 → Step 4 から再実行
- snapshot に意図した要素がない → 仕様書とコードの齟齬を確認 → 修正 → 再実行

修正完了するまで「動作確認済み」と報告しない。

## 失敗例（やってはいけないこと）

- `pnpm build` の通過だけで「動作確認済み」と報告する
- `browser_navigate` でリダイレクトされて `/sign-in` に着地しているのに気付かず OK 判定する
- console error を確認せず snapshot だけで OK 判定する（hydration error など UI 上は見えない不具合を見逃す）

## ユーザー向け報告フォーマット

```
動作確認結果（/<path>）:
- ステータス: 200 OK
- console errors: 0
- 表示確認: <主要要素 1>, <主要要素 2>, <アクションボタン>
- スクショ: .playwright-mcp/<filename>.png（必要な場合のみ）
```
