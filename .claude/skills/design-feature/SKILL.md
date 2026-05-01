---
name: design-feature
description: 新機能の設計をまとめる skill。docs/spec/{feature}/ に人間用 README（背景・全体像・図）と AI 実装用の step ファイル（実装手順・コード例）を作成する。さらに docs/spec/README.md（全機能のクイックリファレンス）も同時に更新する。実装はこの skill が完了してから着手する。ユーザーが「〜の設計を作って」「〜機能を追加したい」「新しい機能を考えたい」など、新機能の仕様策定を依頼したときに使用する。デザインモック作成は対象外（design-mock skill を使う）。
---

# design-feature

新機能の設計書を作成する skill。**実装の前に必ずこの skill を通す**。デザインのモック作成は含まない（モックは `design-mock` skill）。

## このskillが対象とするフロー

```
ユーザー要望ヒアリング
  ↓
docs/spec/{feature}/ ディレクトリ作成
  ├── README.md（人間用：背景・機能一覧・DB/API設計・全体像）
  └── step*.md（AI実装用：レイヤー別の実装手順・コード例・テスト）
  ↓
docs/spec/README.md（全機能のクイックリファレンス）に追記
  ↓
ユーザーレビュー → 修正反復 → OK
  ↓
（実装へ。デザインのモックが必要なら design-mock skill を使う）
```

## 設計書の構造（必須）

### 全体像

```
docs/spec/
├── README.md                           ← 全機能のクイックリファレンス（このskillで都度更新）
├── template/
│   ├── README.md                       ← 機能ごとのREADMEテンプレ
│   └── step1-template.md               ← stepファイルテンプレ
├── {feature-a}/
│   ├── README.md                       ← 人間用設計書
│   ├── step1-db-{topic}.md             ← AI実装用
│   ├── step2-api-{endpoint}.md
│   └── ...
└── {feature-b}/
    └── ...
```

### docs/spec/README.md（クイックリファレンス）

全機能の一覧と概要を一望できるトップレベルの索引。

- 機能一覧テーブル: `機能名` / `ステータス（設計中/実装中/完了）` / `概要` / `リンク`
- 設計書ディレクトリへのリンク（`./feature-a/README.md`）
- 全て日本語

新機能を作ったら必ずこのファイルに 1 行追記する。古くなったエントリは削除/更新する。

### {feature}/README.md（人間用：Why / 全体像）

- 背景・目的
- 機能一覧
- DB 設計（mermaid ER 図 + テーブル定義表）
- API 設計（REST / SSE / WebSocket / Data Channel をテーブル形式で）
- 必要な画面（一覧 + 役割。具体的な UI 仕様は `design-mock` skill で確定後に追記される）
- フロー図（mermaid シーケンス図）
- 注意事項（セキュリティ・パフォーマンス・エッジケース）
- **目次（Table of Contents）必須**: GitHub Markdown アンカーリンク形式

### {feature}/step*.md（AI実装用：How）

- ファイル名: `step{number}-{db|api|web|mobile|admin}-{feature}.md`
- 例: `step1-db-users.md`, `step2-api-create-user.md`, `step3-web-signup-page.md`
- **テスト可能な最小単位** で分割
- **手順番号は本文に振らない**（ファイル名の番号のみ）
- 各 step のセクション: `## 対応内容`（コード例・API仕様・実装詳細）/ `## 動作確認`（テストコード・確認手順）
- AI が実装時に参照するため、**コード例は CLAUDE.md の規約**（`apps/api/CLAUDE.md` のレイヤード / Result型 / テスト戦略 等）に厳密に従う

### 重要：情報の重複を避ける

- **README は背景・全体像・図に専念**
- **step は具体的な実装手順・コード例に専念**
- 詳細仕様は step に書き、README からはリンクで参照する

## 既存の参考実装

設計書を作成する前に、テンプレートと既存機能の設計書を読んで形式を合わせる:

- `docs/spec/template/README.md` — 機能ごとのREADMEテンプレ
- `docs/spec/template/step1-template.md` — step ファイルテンプレ
- `docs/spec/template/quick-reference.md` — `docs/spec/README.md` のテンプレ（存在する場合）
- `docs/spec/{既存機能}/` — 既存機能の設計書（あれば最も網羅的なものを参考）

## 進め方（ステップごと）

### Step 1: ヒアリング

ユーザーから以下を引き出す（不明点は明示的に質問する）:

- 機能の目的・解決したい課題
- 想定ユーザーと利用シーン
- 必要な画面（数 + 役割）
- 連携が必要な既存機能
- 制約事項（パフォーマンス、セキュリティ）

### Step 2: docs/spec/{feature}/README.md を作成

`docs/spec/template/README.md` の構成を参考にする。

- 目次（Table of Contents）を必ず含める
- DB は mermaid ER 図 + テーブル定義表
- API は REST / SSE / Data Channel をテーブル形式で
- UI は画面一覧と役割のみ（具体的な UI 仕様は `design-mock` skill 後に追記される）
- フロー図は mermaid シーケンス図
- 全て日本語

### Step 3: docs/spec/{feature}/step*.md を作成

テスト可能な最小単位で分割:

- `step1-db-{topic}.md` — Prisma スキーマ + マイグレーション
- `step2-api-{endpoint}.md` — Controller / Service / Repository / Router + テスト
- `step3-web-{page}.md` — Next.js ページ実装（本実装。モックとは別）
- `step4-mobile-{screen}.md` — Expo 画面実装（必要なら）
- `step5-admin-{page}.md` — Admin 画面実装（必要なら）

各 step は **`apps/api/CLAUDE.md` のレイヤードアーキテクチャ・Result型・テスト戦略** に従ったコード例を含める。`packages/schema/CLAUDE.md` のスキーマ命名規則にも従う。

### Step 4: docs/spec/README.md（クイックリファレンス）を更新

新機能のエントリを追加する:

| 機能名 | ステータス | 概要 | リンク |
|---|---|---|---|
| {feature} | 設計中 | （1〜2行のサマリ） | [./{feature}/README.md](./{feature}/README.md) |

ファイルが存在しない場合は新規作成する。テンプレートが `docs/spec/template/quick-reference.md` にあればそれを参考にする。

### Step 5: ユーザーレビュー

作成した設計書をユーザーに確認してもらい、修正点があれば反復する。

- DB 設計でOKか
- API 設計でOKか
- 必要な画面の粒度でOKか
- step の分割粒度でOKか

OK が出たら設計フェーズ完了。実装に入る前にデザインのモックが必要なら `design-mock` skill を案内する。

## やってはいけないこと

- README に詳細実装を書き込む（step に分離する）
- step に背景や Why を書き込む（README に分離する）
- **モックを作成する**（このskillの責務外。`design-mock` skill を使う）
- **UI の確定仕様を書き込む**（`design-mock` skill で確定後に追記される）
- ユーザー確認なしに DB/API の方針を独断で決める
- `docs/spec/template/` の形式から逸脱する
- `docs/spec/README.md`（クイックリファレンス）の更新を忘れる
- 設計が完了する前に実装に進む
