# API Server

Express.js + TypeScript による API サーバー

## プロジェクト概要

レイヤードアーキテクチャに基づいた REST API サーバー。Prisma による型安全なデータアクセス、依存性注入による疎結合な設計を採用。

## ディレクトリ構成

```
apps/api/
├── src/
│   ├── index.ts                         # エントリーポイント（DI、サーバー起動）
│   ├── client/                          # 外部APIクライアント（OAuth等）
│   ├── const/                           # 定数定義
│   ├── controller/                      # リクエスト/レスポンスハンドリング
│   │   └── auth/                        # 認証関連のコントローラー
│   ├── lib/                             # ユーティリティ（JWT等）
│   ├── log/                             # ロギング設定
│   ├── middleware/                      # 共通ミドルウェア
│   ├── prisma/                          # Prisma設定、マイグレーション
│   ├── repository/prisma/               # データアクセス層（Prisma）
│   │   └── aggregate/                   # 複数テーブルを跨ぐ操作
│   ├── routes/                          # ルーティング定義
│   ├── service/                         # ビジネスロジック（関数型）
│   └── types/                           # 型定義
│       └── domain/                      # ドメインモデルの型定義
├── .env.local                           # 環境変数
├── package.json
└── tsconfig.json
```

## 設計思想

### 依存方向

- レイヤードアーキテクチャを意識して、メインのアプリケーションロジックであるservice層がDBや外部ライブラリ等の詳細を知らなくて良いようにinterfaceを使用する。

### Interfaceの利用

- 引数やレスポンスにはアプリケーションの型を利用する（外部パッケージの型を変換して扱う）

### 関数型のService 層

- Service層はクラスベースではなく関数ベースにした理由
    1. クラスのDI・インスタンス化がめんどくさい
    2. controllerのテストはインテグレーションテストを想定しているためserviceのモックなどはしない
    3. クラスベースでの状態管理（プライベート引数等）を使用するケースが少ない
- Controller から必要な Repository/Client を引数として受け取る

### ドメインモデル

- types/domainにドメインモデルの型だけ定義している。
- 実装はドメインロジックが必要になるまでしない（おそらく必要になるケースが少ないので対応しない）
- Repository層でPrisma -> ドメインモデル型に変化することでInterfaceを差し替え可能なものにしている
- ビジネス上の区分・列挙型もここに定義する（例: `RegistrationPeriod`）
- Repository / Service は `types/domain` から型をインポートする（`@repo/api-schema` には依存しない）

### Repository 層の役割分担

- `repository/prisma/{feature}-repository.ts`: 単一テーブルに対する操作（CRUD、count、集計クエリ等）
- `repository/prisma/aggregate/`: 複数テーブルをまたぐ集約操作（リレーションの include、トランザクション等）
- Service層は欲しいデータを取得するだけで、詳細なリレーションは把握しなくて良い。必要なデータのリポジトリの関数を呼ぶだけでドメインロジックに集中できる設計にする


## エラーハンドリング（Result 型）

Service 層は **業務エラー（4xx 系で返すべきエラー）は `Result<T>` で返却し、想定外の例外（DB 障害等）は throw** する。Controller は Result を透過で返し、想定外エラーはグローバルエラーハンドラが 500 で処理する。

### 設計方針

- **業務エラーを例外にしない**: Service が `throw` するのは「想定外」のみ。業務上想定されるエラー（バリデーション、重複、NotFound 等）は戻り値で表現する
- **呼び出し側で型安全に扱える**: `Result<T>` を返すことで、呼び出し側（Controller や他 Service）は ok/err を型で判別して分岐できる
- **Controller は透過返却**: `statusCode` と `message` をそのまま HTTP レスポンスに変換する。再解釈が必要な場合のみ Controller で変換
- **予期しない例外はグローバルエラーハンドラに委譲**: Controller で try-catch は書かない（リダイレクトなど UX 上 JSON を返せない特殊ケースを除く）

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

- **戻り値は必ず `Promise<Result<T>>`**（`Promise<T>` や `Promise<T | null>` は使わない）
- **業務エラー**: `return err(notFoundError(...))` のように Result で返却
- **想定外エラー**: DB 呼び出し等で throw される例外はそのまま伝播させる（catch しない）

```typescript
export const createMemo = async (
  data: CreateMemoInput,
  memoRepository: MemoRepository
): Promise<Result<Memo>> => {
  const existing = await memoRepository.findByTitle(data.title)
  if (existing) {
    return err(conflictError("Same title already exists"))  // 業務エラー
  }
  const memo = await memoRepository.create(data)            // DB 障害時は throw（catch しない）
  return ok(memo)
}
```

### Controller 実装ルール

- **try-catch は書かない**（google-callback のようなリダイレクト分岐が必要な特殊ケースを除く）。Service が `throw` した想定外エラーはグローバルエラーハンドラが 500 で返却する
- **Service の `Result` は if-else で透過返却**（3 行 inline。ヘルパー関数は使わない）

```typescript
async execute(req: Request, res: Response) {
  const { id } = deleteMemoPathParamSchema.parse(req.params)

  const result = await service.memo.deleteMemo(id, this.memoRepository)

  if (!result.ok) {
    const errorResponse: ErrorResponse = {
      error: result.error.message,
      status_code: result.error.statusCode,
    }
    return res.status(result.error.statusCode).json(errorResponse)
  }

  return res.status(200).json(deleteMemoResponseSchema.parse({ message: "Memo deleted successfully" }))
}
```

### グローバルエラーハンドラ（`src/middleware/error-handler.ts`）

すべてのルート登録後に `app.use(errorHandler)` で登録される。

- **ZodError** → 400 "Invalid request"（リクエスト検証失敗）
- **その他の throw** → 500 "Internal Server Error"（DB 障害などの想定外エラー）


## テスト戦略

### 基本方針

- **Service層 → ユニットテスト**: DB不要、高速、並列実行可能
- **Controller層 → インテグレーションテスト**: 実DB使用、supertest でHTTPレイヤーからテスト

### ユニットテスト（Service）

Service のユニットテストは以下の3原則を守る。

1. **変更に強い**: 入出力が変わらない限りテストも成功する
2. **すぐにテストできる**: 準備や実行順序に縛られない
3. **並列実行可能**: 他のテストと独立して実行できる

#### mockの方針

- **デフォルトは `jest.fn()` を使用する**。interface に基づいたオブジェクトを `jest.fn()` で作成し、引数として渡す
- **自作 Fake（例: `InMemoryXxxRepository`）は、テスト内で状態の読み書きが複数回絡む場合のみ検討する**。通常のserviceテストでは不要

```typescript
// 基本パターン: jest.fn() でmockを作成し、引数で渡す
const mockFindById = jest.fn()
const mockUserRepository = {
  findById: mockFindById,
}

mockFindById.mockResolvedValue(mockUser)
const result = await getUserById(1, mockUserRepository as any)
```

#### `jest.fn()` と `jest.mock()` の使い分け

| 方法 | 対象 | テストへの影響 | 本プロジェクトでの方針 |
|---|---|---|---|
| `jest.fn()` | 単一の関数。変数に代入して引数経由で渡す | import パスに依存しない。リファクタリング耐性が高い | **推奨** |
| `jest.mock()` | モジュール全体。`import`/`require` の解決自体を差し替える | テストがモジュールのファイルパスに結合する。リファクタリング耐性が低い | **非推奨** |

**本プロジェクトでは Service 層の全ての外部依存を引数（DI）で受け取る設計のため、`jest.mock()` は原則使用しない。**

`jest.mock()` はテスト対象が直接 `import` している内部モジュールを差し替える仕組みであり、テストがファイルパスという実装の詳細に依存する。依存を引数で渡す設計にすれば `jest.fn()` だけでテストが完結し、ファイル移動やリネーム時にテストが壊れない。

参考: [Jest公式 - Mock Functions](https://jestjs.io/docs/mock-functions)

#### テストケースの観点

- 正常系（期待通りの入力 → `ok: true` で期待通りの値）
- 異常系（業務エラー → `ok: false` で `type` / `statusCode` / `message` を検証）
- 予期しないエラー（DB 障害等の throw → `rejects.toThrow(...)`）
- 依存の呼び出し検証（正しい引数で呼ばれたか）

#### Result 型のアサーション

Service は `Result<T>` を返すため、ok 判定で分岐してから値・エラーを検証する。

```typescript
// 成功時
const result = await getMemoById(1, mockMemoRepository)
expect(result.ok).toBe(true)
if (result.ok) {
  expect(result.value).toEqual(mockMemo)
}

// 業務エラー時
const result = await getMemoById(999, mockMemoRepository)
expect(result.ok).toBe(false)
if (!result.ok) {
  expect(result.error.type).toBe("NOT_FOUND")
  expect(result.error.statusCode).toBe(404)
  expect(result.error.message).toBe("Memo not found")  // Service 層のエラーメッセージは実装と一致
}

// 想定外の throw
mockFindById.mockRejectedValue(new Error("Database connection failed"))
await expect(getMemoById(1, mockMemoRepository)).rejects.toThrow("Database connection failed")
```

### インテグレーションテスト（Controller）

ユニットテストで検証できない以下の項目をテストする。

- **controllerが返すレスポンスの全パターン**: 正常系・異常系のHTTPステータスコードとレスポンスボディの存在
- **最終的なDBの状態**: データの作成・更新・削除が正しく反映されているか

※ 認証ミドルウェア単体のテストやリクエストバリデーション単体のテストは行わない。あくまでcontrollerのレスポンスパターンを網羅することで、これらも含めて検証する。

#### アサーションの方針

- **ステータスコード、主要なレスポンスフィールドの値は検証する**（`expect(res.status).toBe(404)`, `expect(res.body.id).toBe(user.id)` など）
- **エラーメッセージの文字列は検証しない**。メッセージはユーザー向け表記の微調整で変わり得るため、`expect(res.body.error).toBeDefined()` のみで「エラーフィールドが返っていること」を確認する

```typescript
// ❌ 悪い例: エラーメッセージの文字列に依存
expect(res.body.error).toBe("Memo not found")

// ✅ 良い例: ステータスコードとエラーフィールドの存在のみ検証
expect(res.status).toBe(404)
expect(res.body.error).toBeDefined()
```

#### グローバルエラーハンドラの適用

`attachErrorHandler(app)` をルート登録後に必ず呼び出し、本番同様に ZodError を 400、想定外 throw を 500 に変換する状態でテストする。

```typescript
const app = createTestApp()
app.use("/api/memo", memoRouter({ detail: new MemoDetailController(memoRepository) }))
attachErrorHandler(app)  // ルート登録後に呼び出すこと
```

#### テスト用DB

- 開発用と同じDBコンテナ内にテスト用データベースを作成する（コンテナを分けない）
- インテグレーションテストはドメイン単位でデータベースを分割可能にし、並列実行やCI での分割実行に対応する
- 各テストケースの `beforeEach` / `afterEach` で初期データの投入とクリーンアップを必ず行い、テスト間の独立性を保証する

#### テストの実行

```bash
# ユニットテストのみ（DB不要）
pnpm test test/service

# インテグレーションテストのみ（DB必要）
pnpm test test/controller

# 全テスト
pnpm test
```

## 開発コマンド

```bash
# 開発サーバー起動（ホットリロード）
pnpm dev

# ビルド
pnpm build

# 本番サーバー起動
pnpm start

# リント
pnpm lint
pnpm lint:fix
```

## Prisma コマンド

```bash
# マイグレーションファイルの作成・実行
cd src/prisma
npx prisma migrate dev --name <migration名>

# クライアントの生成
cd src/prisma
npx prisma generate

# シードの実行
cd src/prisma
npx prisma db seed

# Studio の起動
npx prisma studio --url postgresql://postgres:password@localhost:5432/ai_trainer_dev
```
