---
name: design-feature
description: 新機能の設計をまとめるskill。docs/spec/{feature}/ に README（人間向け：背景・全体像・図）と step ファイル（Claude向け：実装手順・コード例）を作成し、DB/API/デザイン方針が固まった段階で apps/web に簡易モックを生成する。ユーザーが「〜の設計を作って」「〜機能を追加したい」「新しい機能を考えたい」など、新機能の仕様策定を依頼したときに使用する。
---

# design-feature

新機能の設計書を作成し、DB/API/デザイン方針が固まった段階でフロント側のモックまで作る skill。

## このskillが対象とするフロー

```
ユーザー要望ヒアリング
  ↓
README.md（人間向け：背景・全体像・図）を作成
  ↓
step*.md（Claude向け：実装手順・コード例・テスト）を作成
  ↓
DB/API/デザイン方針が固まる
  ↓
apps/web にモック作成（デザインの伝達が目的）
  ↓
ユーザーレビュー → 修正反復
  ↓
ユーザーから OK → このskillはここで終了
  （UI仕様の最終確定は finalize-ui skill へ引き継ぐ）
```

## 設計書の構造（必須）

### ディレクトリ
`docs/spec/{feature}/` を機能単位で作成する。

### ファイル分割

**README.md**: 人間が読みやすい設計書（Why / 全体像）
- 背景・目的
- 機能一覧
- DB 設計（ER 図 + テーブル定義）
- API 設計（REST / SSE / WebSocket / Data Channel）
- UI 設計（画面一覧 + ASCII ワイヤーフレーム + 動作仕様）
- フロー図（mermaid シーケンス図）
- 注意事項（セキュリティ・パフォーマンス・エッジケース）

**step*.md**: Claude が参考にする実装手順（How）
- ファイル名: `step{number}-{db|api|web|mobile|admin}-{feature}.md`
- 例: `step1-db-talk-themes.md`, `step2-api-matching-join.md`, `step3-web-matching-page.md`
- テスト可能な最小単位で分割する
- セクション: `## 対応内容`（コード例・API仕様・実装詳細）と `## 動作確認`（テストコード・確認手順）
- **手順番号は振らない**（ファイル名の番号のみ）

### 重要：情報の重複を避ける
- README は背景・全体像・図に専念
- step は具体的な実装手順・コード例に専念
- 詳細仕様は step に書き、README からはリンクで参照する

## 既存の参考実装

設計書を作成する前に、既存の高品質な設計書を読んで形式を合わせること:
- `docs/spec/matching/README.md` — 1対1ビデオ通話マッチング機能（最も網羅的）
- `docs/spec/profile/README.md` — プロフィール機能
- `docs/spec/template/README.md` — テンプレート

## 進め方（ステップごと）

### Step 1: ヒアリング

ユーザーから以下を引き出す（不明な点は明示的に質問する）:
- 機能の目的・解決したい課題
- 想定ユーザーと利用シーン
- 必要な画面（数 + 役割）
- 連携が必要な既存機能（auth、matching 等）
- 制約事項（パフォーマンス、セキュリティ、デザインの方向性）

### Step 2: README.md を作成

`docs/spec/{feature}/README.md` を作成。matching/README.md の構成を参考にする。
- **目次（Table of Contents）を必ず含める**（CLAUDE.md のルール）
- DB は ER 図（mermaid）+ テーブル定義表
- API は REST / SSE / Data Channel をテーブル形式で
- UI は ASCII ワイヤーフレーム + 動作仕様（モック作成前なのでラフでOK）
- フロー図は mermaid シーケンス図
- 全て日本語

### Step 3: step ファイルを作成

テスト可能な最小単位で分割:
- `step1-db-{topic}.md` — Prisma スキーマ + マイグレーション
- `step2-api-{endpoint}.md` — Controller / Service / Repository / Router + テスト
- `step3-web-{page}.md` — Next.js ページ実装（後述のモックとは別。本実装手順）
- `step4-mobile-{screen}.md` — Expo 画面実装（必要なら）

各 step は CLAUDE.md の「APIレイヤードアーキテクチャ」「Result型」「テスト戦略」に従ったコード例を含める。

### Step 4: DB/API/デザイン方針の確認

ユーザーに以下を確認してから次へ進む:
- DB 設計でOKか
- API 設計でOKか
- デザインの方向性（雰囲気・色・参考にしたい既存機能）

### Step 5: モックを作成（apps/web）

**目的**: デザインの伝達。コンポーネント設計は最低限。

- 配置: `apps/web/src/app/{feature}/page.tsx` （+必要に応じてサブパス）
- 既存の `apps/web/src/app/matching/page.tsx` を参考にする
- ダミーデータは `apps/web/src/libs/mock-data.ts` または各ページ内のローカル定数で
- API 呼び出しはせず、ハードコードされた状態で各画面を表現
- アニメーション・特殊効果（グロー、紙吹雪、グラデーション等）は実際に動くように作る
- Tailwind CSS v4 を使用、既存のデザインシステム（globals.css）に合わせる
- レスポンシブは必要最低限（モバイル幅で見て破綻しない程度）

ユーザーの会話から以下を汲み取ってデザインに反映:
- 雰囲気（カジュアル / シリアス / ゲーム的 / シンプル）
- 色味（プライマリカラー、グラデーション）
- 動き（静的 / アニメーション豊富）
- 既存機能との統一感

### Step 6: モックレビュー

- `pnpm dev` で web を起動し、ユーザーに確認してもらう
- ユーザーの指摘に従って修正を繰り返す
- ユーザーから OK が出るまで反復

### Step 7: 引き継ぎ

ユーザーから OK が出たら、このskillはここで終了。
「UI 仕様を設計書に落とし込むには `finalize-ui` skill を使ってください」と案内する。

## やってはいけないこと

- README に詳細実装を書き込む（step に分離する）
- step に背景や Why を書き込む（README に分離する）
- モックで完璧なコンポーネント設計をする（デザインの伝達が目的）
- モックで実 API を呼ぶ（ダミーデータで完結させる）
- ユーザー確認なしに DB/API/デザインの方針を独断で決める
- 既存の matching/profile の設計書形式から逸脱する
