# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Turborepo + pnpm monorepo containing a full-stack application with:
- **apps/web**: Next.js 16 web application (port 3000)
- **apps/admin**: Next.js 16 admin dashboard (port 3030)
- **apps/mobile**: Expo/React Native mobile application
- **apps/api**: Express.js API server (port 8080)
- **packages/schema**: Shared Zod schemas for API validation and TypeScript types
- **packages/terraform**: Infrastructure as Code for AWS deployment

## Common Commands

### Root-level commands (run from project root):
```bash
pnpm dev          # Start all apps in dev mode
pnpm build        # Build all apps
pnpm lint         # Run ESLint on all apps
pnpm lint:fix     # Fix ESLint issues
pnpm test         # Run tests
```

### App-specific commands:
```bash
# Web app (apps/web)
cd apps/web
pnpm dev          # Start on http://localhost:3000
pnpm build        # Build for production
pnpm start        # Start production server

# Admin app (apps/admin)
cd apps/admin
pnpm dev          # Start on http://localhost:3030
pnpm build        # Build for production
pnpm start        # Start production server

# API server (apps/api)
cd apps/api
pnpm dev          # Start with hot reload on http://localhost:8080
pnpm build        # Compile TypeScript to dist/
pnpm start        # Run compiled version from dist/
pnpm test         # ローカル用（dotenvx で .env.local を復号化して実行）
pnpm test:ci      # CI用（dotenvx不要。環境変数は外部から渡す前提。generate + migrate + jest を一括実行）

# Mobile app (apps/mobile)
cd apps/mobile
pnpm start        # Start Expo dev server
pnpm android      # Run on Android
pnpm ios          # Run on iOS
```

### Schema package:
```bash
cd packages/schema
pnpm build        # Compile TypeScript
pnpm dev          # Watch mode for development
```

### Terraform:
```bash
cd packages/terraform/aws/env/dev
terraform init    # Initialize (first time only)
terraform plan    # Preview changes
terraform apply   # Deploy infrastructure
terraform destroy # Tear down infrastructure

# Linting and validation
terraform fmt -check -recursive -diff
terraform validate
tflint --init
tflint --chdir=aws/env/dev --config=$(pwd)/.tflint.hcl --recursive
trivy config aws/env/dev -c .trivy.yml
```

## Architecture

### Monorepo structure with Turborepo
- Uses pnpm workspaces to link packages
- Turborepo handles build orchestration with task dependencies
- `^build` in turbo.json means "build dependencies first"
- Dev servers use `persistent: true` in turbo.json
- All env files (`.env*.local`) invalidate Turbo cache via `globalDependencies`

### Shared schema package (@repo/api-schema)
- **Critical**: All API schemas are defined in `packages/schema/src/api-schema/` using Zod
- The API server (`apps/api`) and frontend apps import these schemas for validation
- This ensures request/response contracts are shared and type-safe across the stack
- Each API endpoint has: request schema, response schema, and inferred TypeScript types
- When adding new API endpoints, **always** define schemas in `packages/schema` first, then import them in the API and frontend
- **ファイル構成**: API（エンドポイント）と1対1でファイルを作成する。アプリ固有のスキーマはサブディレクトリに分割する
  - 例: `api-schema/category.ts`, `api-schema/admin/stats.ts`, `api-schema/admin/user.ts`
  - Admin とアプリケーションでリクエスト・レスポンスが異なるため、同じドメインでもアプリごとにファイルを分ける
- **コメントルール**: `// ===...` でエンドポイントのセクション区切り + `/** */` でスキーマ説明
  ```typescript
  // ========================================================
  // GET /api/categories - カテゴリー一覧取得
  // ========================================================

  /**
   * カテゴリー一覧取得のレスポンススキーマ
   */
  export const getCategoryListResponseSchema = z.object({ ... })
  ```

#### スキーマの命名規則

**パラメータ種別ごとに個別のスキーマを定義する**（共通スキーマは作らない。AI の観点からも例外を作らず、エンドポイントごとに独立した検証を行うため）。

| 種類 | 命名 | 例 |
|---|---|---|
| 路径パラメータ（`/resource/:id`） | `{action}{Domain}PathParamSchema` | `deleteMemoPathParamSchema` |
| クエリ文字列（`?foo=bar`） | `{action}{Domain}QueryStringSchema` | `getMemoQueryStringSchema` |
| リクエストボディ（POST/PUT） | `{action}{Domain}RequestSchema` | `createMemoRequestSchema` |
| レスポンス | `{action}{Domain}ResponseSchema` | `createMemoResponseSchema` |

- **型は `z.infer` で自動生成**し、手書きの interface は使わない
- **路径パラメータの ID 検証は `z.coerce.number().int().positive()`** で string → number の変換を Zod 側で行う（Controller で `Number()` しない）
- **すべてのリクエスト入力（body / params / query）は Zod で検証**する。`Number()` + `isNaN` や `parseInt` の inline 検証は使わない

#### Zod 検証の適用範囲

- **body**: 必ず Zod 検証（複雑な構造・型安全性のため）
- **params (path)**: 必ず Zod 検証（`z.coerce.number().int().positive()` で数値変換も同時に）
- **query string**: 必ず Zod 検証（`z.coerce.number()` で coerce、`.min().max()` で範囲制約、`.optional()` / `.default()` で省略対応）

一貫性のため例外を作らない。簡単な 1 フィールドでも Zod を通す。

### API server architecture
- Express.js with TypeScript
- All endpoints validate requests/responses using Zod schemas from `@repo/api-schema`
- Main file: `apps/api/src/index.ts`
- Uses `ts-node-dev` for hot reload in development
- Compiles to `dist/` for production

### API レイヤードアーキテクチャ（必ず既存ファイルを参考にして実装すること）
新しい機能を追加する際は、必ず既存の実装（例: memo, health）のコードを読んでからパターンを合わせること。

- **Repository**（`src/repository/prisma/`）: Interface + Class パターン
  - `interface {Feature}Repository` でインターフェースを定義
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
  - **戻り値は必ず `Promise<Result<T>>`**（業務エラーは `err(...)` で、想定外エラーは throw）
- **Controller**（`src/controller/{feature}/`）: Class + `execute(req, res)` パターン。API（エンドポイント）と1対1でファイルを作成する
  - Admin とアプリケーションでリクエスト・レスポンスが異なるため、同じドメインでもアプリごとにコントローラーを分ける（例: `controller/category/list.ts` と `controller/admin/category-list.ts`）
  - `class {Feature}{Action}Controller` で定義（例: `CategoryListController`）
  - constructor で Repository を受け取る
  - `async execute(req: Request, res: Response)` メソッドで処理
  - `@repo/api-schema` のスキーマで req.params / req.body / req.query をバリデーション、レスポンスを parse
  - **try-catch は書かない**。Service が `throw` した想定外エラーはグローバルエラーハンドラが 500 で返却する
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

### エラーハンドリング（Result 型）

Service 層は **業務エラー（4xx 系で返すべきエラー）は `Result<T>` で返却し、想定外の例外（DB 障害等）は throw** する。Controller は Result を透過で返し、想定外エラーはグローバルエラーハンドラが 500 で処理する。

#### Result 型の定義（`src/types/result.ts`）

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

#### ヘルパー関数

```typescript
import { ok, err, notFoundError, conflictError, badRequestError } from "../types/result"

return ok(user)                                              // 成功
return err(notFoundError("User not found"))                  // 404
return err(conflictError("Same file already uploaded"))      // 409
return err(badRequestError("Invalid category_id"))           // 400
```

#### Service 実装ルール

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

#### Controller 実装ルール

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

#### グローバルエラーハンドラ（`src/middleware/error-handler.ts`）

すべてのルート登録後に `app.use(errorHandler)` で登録される。

- **ZodError** → 400 "Invalid request"（リクエスト検証失敗）
- **その他の throw** → 500 "Internal Server Error"（DB 障害などの想定外エラー）

Controller で try-catch を書く必要はない。

### Frontend architecture
- **Web & Admin**: Next.js 16 with App Router
  - Uses Tailwind CSS v4 with PostCSS
  - App Router structure in `src/app/` directory
  - Both apps import types/schemas from `@repo/api-schema`
  - **API 通信はブラウザから直接 Express API を fetch しない**。必ずサーバーサイドを経由してサーバー間通信する
  - **データ取得（GET）**:
    - 基本: Server Component で `apiClient.get()` → Express API
    - Client Component から動的に取得が必要な場合（タブ切替、検索等）: Route Handler (`app/api/*/route.ts`) を作成し、Client Component から fetch する
  - **データ変更（POST/PUT/DELETE）**:
    - 基本: Server Action (`"use server"`) → Express API。フォーム送信やボタンクリックによる CRUD 操作に使用
    - Server Action が適さない場合（ファイルアップロード、外部公開 API 等）: Route Handler を使用
  - **Server Action をデータ取得（GET 相当）に使ってはならない**。Server Action は mutation 専用。データ取得には Server Component または Route Handler を使う
  - **Server Action の配置**: 対応するページと同じディレクトリに `actions.ts` として配置する（例: `app/(dashboard)/categories/actions.ts`）。`app/actions/` のような共通ディレクトリには置かない
- **Mobile**: Expo with file-based routing (expo-router)
  - Uses React Navigation with bottom tabs
  - File-based routing in `app/` directory
  - Theme support via `@react-navigation/native`
- **フロントエンド共通ルール（Web / Mobile / Admin）**:
  - APIのリクエスト・レスポンスの型はローカルで独自定義せず、必ず `@repo/api-schema` からインポートして使用する
  - ローカルに同等の型を定義すると、API側の変更に追従できず型の不整合バグが発生するため禁止

### Admin API 設計方針
- Admin API はすべて `/api/admin/` 配下に配置し、ユーザー向け API と分離する
- Controller / Service は共通のものを使い、Router（`admin-router.ts`）で `/api/admin/` にマッピング
- スキーマは `api-schema/admin/` に集約。既存と同一なら re-export、Admin 固有のレスポンスが必要になった時点で新規定義
- 認証: 現時点は `PUBLIC_PATHS` で認証なし（将来 Admin 専用認証を追加予定）
- ダミーデータ: `ADMIN_USE_DUMMY=true`（API の `.env.local`）で DB 不要のダミーモード

### テスト戦略とテストの耐久性（必須）

#### レイヤー別のテスト種別

- **Service層 → ユニットテスト**（`apps/api/test/service/`）: DB 不要、`jest.fn()` で Repository をモック、高速・並列実行可
- **Controller層 → インテグレーションテスト**（`apps/api/test/controller/`）: 実 DB を使い、`supertest` で HTTP レイヤーから検証

#### テストの耐久性（重要）

**エラーメッセージなどの文字列は assertion しない**。テストが脆くなり、文言変更・i18n 対応・ログ改善のたびに無関係なテストが落ちるため。

##### ❌ 禁止パターン

```typescript
// メッセージの文言に依存した assertion は禁止
await expect(uploadCsv(...)).rejects.toThrow("このCSVファイルはすでにアップロード済みです")
expect(res.body.error).toBe("Invalid memo ID")
expect(result.error.message).toContain("すでに")
```

##### ✅ 推奨パターン

**Service のユニットテスト**: Result 型の構造（`ok` / `statusCode` / `type`）のみを検証

```typescript
// 業務エラー
const result = await uploadCsv(...)
expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.statusCode).toBe(409)
  expect(result.error.type).toBe("CONFLICT")
}

// 想定外の例外（DB 障害等）
await expect(uploadCsv(...)).rejects.toThrow()  // メッセージは引数に渡さない
```

**Controller のインテグレーションテスト**: HTTP ステータスコードとレスポンスボディの「存在」のみを検証

```typescript
expect(res.status).toBe(400)
expect(res.body.error).toBeDefined()  // 文言は照合しない
```

#### Controller テストのセットアップ

バリデーションエラー（`ZodError`）を 400 として返すには、テスト用 app に `attachErrorHandler` を登録する必要がある:

```typescript
import { attachErrorHandler, createTestApp } from "../helper"

const app = createTestApp()
app.use("/api/memo", memoRouter({ ... }))
attachErrorHandler(app)  // ← ルート登録後に必ず呼ぶ
```

#### モックの方針

- **デフォルトは `jest.fn()` を使用する**。interface に基づいたオブジェクトを `jest.fn()` で作成し、引数として渡す
- **`jest.mock()` は非推奨**。import パスに結合するためリファクタリング耐性が低い
- **自作 Fake（例: `InMemoryXxxRepository`）は、テスト内で状態の読み書きが複数回絡む場合のみ検討する**

#### この方針の理由

1. **リファクタリング耐性**: 文言改善・ログ改修・i18n 対応でテストが落ちない
2. **レビュー負荷軽減**: 文言変更のたびにテストを更新する必要がない
3. **網羅性と独立性**: 「何が起きたか」は `statusCode` / `type` で構造的に表現し、文字列で表現しない
4. **AI/自動化フレンドリー**: 文言に例外を作らないため、AI による自動リファクタリングで誤検知が起きにくい

#### 境界値テスト（必須）

日付フィルタや条件分岐を含むAPIでは、**境界値のテストケースを必ず追加する**。正常系だけでなく、境界の直前・直後のデータで意図通りに含まれる/除外されることを検証する。

##### 日付フィルタの場合

月フィルタでは**前月末日・当月初日・当月末日・翌月初日**の4点をテストデータに含め、当月のデータだけが返ることを検証する:

```typescript
// 3月フィルタの境界値テスト
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

##### 条件分岐の場合

if文やswitch文でデータの振り分けがある場合、**各分岐の境界値**をテストデータに含める（例: 金額が0以下でスキップする処理なら `amount: 0` と `amount: 1` の両方をテスト）。

### Infrastructure (Terraform)
- Structure: `packages/terraform/aws/{bootstrap,env,modules}`
- Bootstrap: S3 backend and DynamoDB for state locking
- Env: Environment-specific configs (dev/staging/prod)
- Modules: Reusable Terraform modules
- Uses tflint and trivy for security/policy checks

## Code Style and Linting

All apps use ESLint v9 with flat config format (`eslint.config.{js,mjs}`).

### ESLint Configuration Architecture
- **Web & Admin**: Use `eslint-config-next` which includes `@typescript-eslint` plugin
  - Do NOT redefine `@typescript-eslint` plugin in custom configs - it will cause "Cannot redefine plugin" errors
  - Override `languageOptions.parserOptions` and `rules` only
- **Mobile**: Uses `eslint-config-expo/flat` which includes `@typescript-eslint` plugin
  - Do NOT redefine `@typescript-eslint` plugin in custom configs
  - Additional plugins like `tailwindcss` can be added separately
- **API**: Defines all plugins from scratch (no preset config)

### Key rules enforced:
- **No semicolons** (`semi: ["error", "never"]`)
- **Double quotes** for strings (`quotes: ["error", "double"]`)
- **Object curly spacing** required (`{ foo }` not `{foo}`)
- **Strict equality** (`===` not `==`)
- **Import ordering**: builtin → external → internal (@repo) → parent → sibling → index, with newlines between groups
- **Sort object keys** alphabetically (2+ keys)。ただし以下の例外あり:
  - `id` は常に先頭に配置
  - `createdAt` / `updatedAt` / `deletedAt`（およびスネークケースの `created_at` / `updated_at` / `deleted_at`）は常に末尾に配置
  - それ以外のプロパティはアルファベット順
  - 例: `{ id, color, name, sortOrder, createdAt, updatedAt }`
- **バレルエクスポート（index.ts）** はファイル名のアルファベット順で記載する
- **React JSX props**: callbacks last, shorthand first, reserved first
- **TypeScript**: No `any` (warn), no empty functions, use `async` for Promise-returning functions
- **Naming conventions**:
  - Variables: camelCase, UPPER_CASE, or PascalCase
  - Functions: camelCase or PascalCase
  - Types: PascalCase
- **Prefer**: const over let/var, template literals over string concatenation, arrow callbacks
- **関数名は処理内容が明確にわかる名前にする**:
  - 何を・どう変換/処理するかが関数名だけで伝わること
  - 悪い例: `parseCsvLine`, `toHalfWidth`, `parseAmount`
  - 良い例: `splitCsvLineWithQuotes`, `convertFullWidthToHalfWidth`, `convertCommaAmountToNumber`

### Function style:
- **API (`apps/api`)**: `function` 宣言は使わず、`const` + アロー関数で統一する（例: `export const foo = async () => {}`）
- **Web / Mobile / Admin**: コンポーネントは `function` ベースでもOK

### Comment style:
- コメントの書き方は既存のファイルを参考にして統一する
- ブロックコメントは `/** */` 形式で統一する（`//` は使わない）
- 1行でも複数行形式で書く:
  ```
  /**
   * コメント内容
   */
  ```

### When editing files:
- Run `pnpm lint:fix` after making changes to auto-fix formatting
- If adding new imports, ensure they follow the import order rules
- Object keys should be sorted alphabetically

## Environment Requirements

- **Node.js**: >=18.0.0
- **pnpm**: >=9.0.0 (specified in `package.json` via `packageManager` field)
- **Terraform**: Required for infrastructure work
- **AWS CLI**: Required for Terraform deployment (authenticate with `aws configure`)

## Development Workflow

1. **Install dependencies** (first time): `pnpm install` from root
2. **Build shared packages**: `pnpm build` to compile `@repo/api-schema`
3. **Start development**: `pnpm dev` from root to start all apps, or `cd` into specific app and run `pnpm dev`
4. **Add new API endpoint**:
   - Define schemas in `packages/schema/src/api-schema/{domain}.ts`
   - Export from `packages/schema/src/api-schema/index.ts`
   - Rebuild schema package: `cd packages/schema && pnpm build`
   - Implement endpoint in `apps/api/src/index.ts` using the schemas
   - Use schemas in frontend apps for type safety
5. **Lint before committing**: `pnpm lint:fix` from root

## Important Notes

- The schema package must be built before running apps that depend on it
- When changing schemas, rebuild with `cd packages/schema && pnpm build`
- API server uses `dotenvx` to load `.env.local` files（環境変数は暗号化されている。詳細は下記「環境変数の管理」セクションを参照）
- Web app runs on port 3000, admin on 3030, API on 8080 (configurable via PORT env var)
- Terraform state is stored in S3 with DynamoDB locking (configured in bootstrap)
- All documentation is in Japanese in `docs/setup/` directory

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

## Documentation Guidelines

### Specification and Design Documents (`docs/spec/`)

仕様書・設計書は `docs/spec/` ディレクトリに配置します。AI が仕様書を作成・更新する際は以下のルールに従ってください。

#### ファイル構成
- 機能単位でディレクトリを作成（例: `docs/spec/auth/`, `docs/spec/payment/`）
- 各機能は **テスト可能な最小単位** でステップファイルに分割
- API、Web、Mobile など複数のアプリに跨る場合でも、テスト可能な単位で分割
- README.mdには機能単位の設計書を記述して欲しいです。

#### stepファイルの記述ルール
- **実装手順に番号を振らない**
- 各ステップファイルには以下のセクションを含める:
  - **対応内容**: 実装する内容の詳細（コード例、API仕様など）
  - **動作確認**: テストコードや動作確認の方法
- 全て日本語で記述

#### stepファイルの命名規則
- step{number}-{db or api or web or mobile or admin}-{feature}.mdのようにprefixでおおよそのファイルがわかるように命名してください

#### テンプレート
`docs/spec/template/step1-template.md` にステップファイルのテンプレートがあります。

#### README.mdファイルの記述ルール
- 全て日本語で記述
- **目次（Table of Contents）を必ず含める**: `## 目次` セクションとして、ドキュメント内の全 `##` / `###` 見出しへのリンクをネストしたリスト形式で記載する
  - 見出しが追加・変更された場合は目次も同期して更新する
  - GitHub の Markdown アンカーリンク形式を使用（例: `[セクション名](#セクション名)`）

#### テンプレート
`docs/spec/template/README.md` にREADME.mdファイルのテンプレートがあります。
