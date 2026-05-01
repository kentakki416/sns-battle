# apps/api

Express.js + TypeScript の API サーバー（port 8080）。リクエスト/レスポンスは全て `@repo/api-schema` の Zod スキーマで検証する。

## Commands

```bash
pnpm dev          # ts-node-dev でホットリロード起動
pnpm build        # dist/ にコンパイル
pnpm start        # dist/ から起動
pnpm test         # ローカル用（dotenvx で .env.local を復号化して実行）
pnpm test:ci      # CI用（dotenvx不要。環境変数は外部から渡す前提。generate + migrate + jest を一括）
```

## API レイヤードアーキテクチャ（必ず既存ファイルを参考に実装）

新機能を追加する際は、必ず既存実装（例: memo, health）のコードを読んでからパターンを合わせること。

- **Repository**（`src/repository/prisma/`）: Interface + Class パターン
  - `interface {Feature}Repository` でインターフェース定義
  - `class Prisma{Feature}Repository implements {Feature}Repository` で実装
  - constructor で `PrismaClient` を受け取る
  - `private _toDomain()` メソッドで Prisma の型 → ドメイン型に変換
  - Input 型（`Create{Feature}Input`, `Update{Feature}Input`）はリポジトリファイル内に定義
- **Service**（`src/service/`）: エクスポート関数パターン
  - クラスではなく `export const` のアロー関数で定義
  - Repository をパラメーターとして受け取る（DI はコントローラー経由）
  - `service/index.ts` で `export * as {feature} from "./{feature}-service"` としてバレルエクスポート
  - 呼び出し側は `service.{feature}.{method}(data, repository)` の形式
  - `logger.debug()` で処理の開始・完了をログ出力
  - **戻り値は必ず `Promise<Result<T>>`**（業務エラーは `err(...)`、想定外エラーは throw）
- **Controller**（`src/controller/{feature}/`）: Class + `execute(req, res)` パターン。API（エンドポイント）と1対1でファイルを作成
  - Admin とアプリケーションでリクエスト・レスポンスが異なるため、同じドメインでもアプリごとにコントローラーを分ける（例: `controller/category/list.ts` と `controller/admin/category-list.ts`）
  - `class {Feature}{Action}Controller` で定義（例: `CategoryListController`）
  - constructor で Repository を受け取る
  - `async execute(req: Request, res: Response)` メソッドで処理
  - `@repo/api-schema` のスキーマで `req.params` / `req.body` / `req.query` をバリデーション、レスポンスを parse
  - **try-catch は書かない**。Service が `throw` した想定外エラーはグローバルエラーハンドラが 500 で返却
  - **Service の `Result` は if-else で透過返却**（3 行 inline。ヘルパー関数は使わない）:
    ```typescript
    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }
    ```
- **Router**（`src/routes/`）: Optional controllers オブジェクトパターン
  - `type {Feature}RouterControllers = { list?: ..., create?: ..., ... }` で定義
  - `export const {feature}Router = (controllers: {Feature}RouterControllers): Router => { ... }`
  - 各コントローラーが存在する場合のみルートを登録
- **Domain 型**（`src/types/domain/`）: 各機能ごとにファイルを作成し、`index.ts` でバレルエクスポート
  - ビジネス上の区分・列挙型もここに定義する（例: `RegistrationPeriod`）
  - Repository / Service は `types/domain` から型をインポートする（`@repo/api-schema` に依存しない）
  - `@repo/api-schema` の Zod スキーマは同じ値で独立定義し、API バリデーション用として使う
- **DI（依存性注入）**: `index.ts` で Repository → Controller → Router の順にインスタンス化して組み立て

## エラーハンドリング（Result 型）

Service 層は **業務エラー（4xx 系）は `Result<T>` で返却、想定外の例外（DB 障害等）は throw** する。Controller は Result を透過で返し、想定外エラーはグローバルエラーハンドラが 500 で処理する。

### Result 型の定義（`src/types/result.ts`）

```typescript
export type ApiError = {
  statusCode: number
  type: "BAD_REQUEST" | "CONFLICT" | "FORBIDDEN" | "NOT_FOUND" | "UNAUTHORIZED"
  message: string
}

export type Result<T> =
  | { ok: true; value: T }
  | { error: ApiError; ok: false }
```

### ヘルパー関数

```typescript
import { ok, err, notFoundError, conflictError, badRequestError } from "../types/result"

return ok(user)                                              // 成功
return err(notFoundError("User not found"))                  // 404
return err(conflictError("Same file already uploaded"))      // 409
return err(badRequestError("Invalid category_id"))           // 400
```

### Service 実装ルール

- **業務エラー**: `return err(conflictError(...))` のように Result で返却
- **想定外エラー**: DB 呼び出し等での `throw` はそのまま伝播（catch しない）
- **シグネチャ**: `Promise<Result<T>>` を返す（`Promise<T>` ではなく）

```typescript
export const createFoo = async (...): Promise<Result<Foo>> => {
  const existing = await repo.findById(...)
  if (existing) {
    return err(conflictError("Already exists"))  // 業務エラー
  }
  const foo = await repo.create(...)             // DB 障害時は throw する（catch しない）
  return ok(foo)
}
```

### Controller 実装ルール

- **Service から別 Service を呼ぶときも Result の ok 判定を行い、そのまま re-return か再解釈する**
- **透過返却が基本**（Service の statusCode がそのまま API の statusCode）
- **再解釈が必要な場合のみ Controller で明示的に変換**（例: pre-condition check の 404 を 400 に変換）

```typescript
async execute(req, res) {
  const { id } = deleteMemoPathParamSchema.parse(req.params)

  const result = await service.memo.deleteMemo(id, this.memoRepository)

  if (!result.ok) {
    const errorResponse: ErrorResponse = {
      error: result.error.message,
      status_code: result.error.statusCode,
    }
    return res.status(result.error.statusCode).json(errorResponse)
  }

  return res.status(200).json(deleteMemoResponseSchema.parse({ message: "OK" }))
}
```

### グローバルエラーハンドラ（`src/middleware/error-handler.ts`）

すべてのルート登録後に `app.use(errorHandler)` で登録される。

- **ZodError** → 400 "Invalid request"（リクエスト検証失敗）
- **その他の throw** → 500 "Internal Server Error"（DB 障害等の想定外エラー）

Controller で try-catch を書く必要はない。

## Admin API 設計方針

- Admin API はすべて `/api/admin/` 配下に配置し、ユーザー向け API と分離する
- Controller / Service は共通のものを使い、Router（`admin-router.ts`）で `/api/admin/` にマッピング
- スキーマは `api-schema/admin/` に集約。既存と同一なら re-export、Admin 固有のレスポンスが必要になった時点で新規定義
- 認証: 現時点は `PUBLIC_PATHS` で認証なし（将来 Admin 専用認証を追加予定）
- ダミーデータ: `ADMIN_USE_DUMMY=true`（API の `.env.local`）で DB 不要のダミーモード

## テスト戦略とテストの耐久性（必須）

### レイヤー別のテスト種別

- **Service層 → ユニットテスト**（`apps/api/test/service/`）: DB 不要、`jest.fn()` で Repository をモック、高速・並列実行可
- **Controller層 → インテグレーションテスト**（`apps/api/test/controller/`）: 実 DB を使い、`supertest` で HTTP レイヤーから検証

### テストの耐久性（重要）

**エラーメッセージなどの文字列は assertion しない**。テストが脆くなり、文言変更・i18n 対応・ログ改善のたびに無関係なテストが落ちるため。

#### 禁止パターン

```typescript
/** メッセージの文言に依存した assertion は禁止 */
await expect(uploadCsv(...)).rejects.toThrow("このCSVファイルはすでにアップロード済みです")
expect(res.body.error).toBe("Invalid memo ID")
expect(result.error.message).toContain("すでに")
```

#### 推奨パターン

**Service のユニットテスト**: Result 型の構造（`ok` / `statusCode` / `type`）のみを検証

```typescript
/** 業務エラー */
const result = await uploadCsv(...)
expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.statusCode).toBe(409)
  expect(result.error.type).toBe("CONFLICT")
}

/** 想定外の例外（DB 障害等） */
await expect(uploadCsv(...)).rejects.toThrow()  // メッセージは引数に渡さない
```

**Controller のインテグレーションテスト**: HTTP ステータスコードとレスポンスボディの「存在」のみを検証

```typescript
expect(res.status).toBe(400)
expect(res.body.error).toBeDefined()  // 文言は照合しない
```

### Controller テストのセットアップ

バリデーションエラー（`ZodError`）を 400 として返すには、テスト用 app に `attachErrorHandler` を登録する必要がある:

```typescript
import { attachErrorHandler, createTestApp } from "../helper"

const app = createTestApp()
app.use("/api/memo", memoRouter({ ... }))
attachErrorHandler(app)  // ← ルート登録後に必ず呼ぶ
```

### モックの方針

- **デフォルトは `jest.fn()` を使用する**。interface に基づいたオブジェクトを `jest.fn()` で作成し、引数として渡す
- **`jest.mock()` は非推奨**。import パスに結合するためリファクタリング耐性が低い
- **自作 Fake（例: `InMemoryXxxRepository`）は、テスト内で状態の読み書きが複数回絡む場合のみ検討する**

### この方針の理由

1. **リファクタリング耐性**: 文言改善・ログ改修・i18n 対応でテストが落ちない
2. **レビュー負荷軽減**: 文言変更のたびにテストを更新する必要がない
3. **網羅性と独立性**: 「何が起きたか」は `statusCode` / `type` で構造的に表現し、文字列で表現しない
4. **AI/自動化フレンドリー**: 文言に例外を作らないため、AI による自動リファクタリングで誤検知が起きにくい

### 境界値テスト（必須）

日付フィルタや条件分岐を含む API では、**境界値のテストケースを必ず追加する**。正常系だけでなく、境界の直前・直後のデータで意図通りに含まれる/除外されることを検証する。

#### 日付フィルタの場合

月フィルタでは **前月末日・当月初日・当月末日・翌月初日** の4点をテストデータに含め、当月のデータだけが返ることを検証する:

```typescript
/** 3月フィルタの境界値テスト */
await testPrisma.transaction.createMany({
  data: [
    { transactionDate: new Date("2026-02-28"), description: "前月末" },  // 含まれない
    { transactionDate: new Date("2026-03-01"), description: "当月初" },  // 含まれる
    { transactionDate: new Date("2026-03-31"), description: "当月末" },  // 含まれる
    { transactionDate: new Date("2026-04-01"), description: "翌月初" },  // 含まれない
  ],
})

const res = await request(app).get("/api/transactions").query({ month: 3, year: 2026 })
expect(res.body.transactions).toHaveLength(2)
```

#### 条件分岐の場合

if文 / switch文でデータの振り分けがある場合、**各分岐の境界値**をテストデータに含める（例: 金額が0以下でスキップする処理なら `amount: 0` と `amount: 1` の両方をテスト）。

## 環境変数の管理（dotenvx）

`.env.local` ファイルの環境変数は [dotenvx](https://dotenvx.com/) で暗号化されている。**手動で `.env.local` を編集してはならない**。必ず以下のコマンドを使うこと。

```bash
# 環境変数の追加・更新（apps/api ディレクトリで実行）
npx dotenvx set KEY_NAME "value" -f .env.local

# 環境変数の値を確認（復号化して表示）
npx dotenvx get KEY_NAME -f .env.local

# 全環境変数を復号化して表示
npx dotenvx get -f .env.local
```

- 暗号化の鍵は `.env.keys` ファイルに格納されている（`.gitignore` 対象）
- `package.json` のスクリプトは `dotenvx run -f .env.local --` で環境変数を注入して実行する

## 新エンドポイント追加の手順

1. `packages/schema/src/api-schema/{domain}.ts` にスキーマ定義（命名規則は `packages/schema/CLAUDE.md` 参照）
2. `packages/schema/src/api-schema/index.ts` から export
3. `cd packages/schema && pnpm build`
4. Domain 型 → Repository → Service → Controller → Router の順で実装
5. Service ユニットテスト + Controller インテグレーションテストを作成
6. `index.ts` で DI を組み立て
