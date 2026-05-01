# apps/web

Next.js 16 (App Router) の web アプリケーション（port 3000）。Tailwind CSS v4 + PostCSS。

## Commands

```bash
pnpm dev          # http://localhost:3000 で起動
pnpm build        # 本番ビルド
pnpm start        # 本番サーバー起動
```

## アーキテクチャ

- App Router 構成: `src/app/` 配下
- 型・スキーマは `@repo/api-schema` から import（**ローカル独自定義は禁止**：API 側の変更に追従できず型不整合バグが発生するため）

## API 通信ルール

**ブラウザから直接 Express API を fetch しない**。必ずサーバーサイドを経由してサーバー間通信する。

### データ取得（GET）

- **基本**: Server Component で `apiClient.get()` → Express API
- **Client Component から動的に取得が必要な場合**（タブ切替、検索等）: Route Handler (`app/api/*/route.ts`) を作成し、Client Component から fetch する

### データ変更（POST/PUT/DELETE）

- **基本**: Server Action (`"use server"`) → Express API。フォーム送信やボタンクリックによる CRUD 操作に使用
- **Server Action が適さない場合**（ファイルアップロード、外部公開 API 等）: Route Handler を使用

### 禁止事項

- **Server Action をデータ取得（GET 相当）に使ってはならない**。Server Action は mutation 専用。データ取得には Server Component または Route Handler を使う

### Server Action の配置

対応するページと同じディレクトリに `actions.ts` として配置する（例: `app/(dashboard)/categories/actions.ts`）。`app/actions/` のような共通ディレクトリには置かない。
