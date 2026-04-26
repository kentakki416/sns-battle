# 共通基盤 設計書

## 目次

- [概要](#概要)
- [DB 設計](#db-設計)
  - [users（既存 + 拡張）](#users既存--拡張)
  - [auth_accounts（既存）](#auth_accounts既存)
  - [follows](#follows)
  - [blocks](#blocks)
  - [stamp_masters](#stamp_masters)
  - [talk_themes](#talk_themes)
  - [talk_theme_choices](#talk_theme_choices)
- [API 設計](#api-設計)
  - [共通仕様](#共通仕様)
  - [認証 API](#認証-api)
  - [ユーザー API](#ユーザー-api)
  - [マスターデータ API](#マスターデータ-api)
  - [Webhook API](#webhook-api)
  - [Admin API](#admin-api)
- [UI 設計](#ui-設計)
  - [共通レイアウト](#共通レイアウト)
  - [共通コンポーネント](#共通コンポーネント)
- [Enum 定義（共通）](#enum-定義共通)

---

## 概要

3機能（配信・マッチング・バトル）で共有するテーブル、API、UI コンポーネントの設計。

---

## DB 設計

### users（既存 + 拡張）

| カラム | 型 | 制約 | 説明 | 変更 |
|--------|------|------|------|------|
| id | int | PK, auto_increment | ユーザーID | 既存 |
| email | varchar | unique, nullable | メールアドレス | 既存 |
| name | varchar | nullable | 表示名 | 既存 |
| avatar_url | varchar | nullable | アバター画像URL | 既存 |
| bio | text | nullable | 自己紹介文 | **追加** |
| is_onboarded | boolean | NOT NULL, default: false | 初期設定完了フラグ | **追加** |
| created_at | timestamp | NOT NULL | 作成日時 | 既存 |
| updated_at | timestamp | NOT NULL | 更新日時 | 既存 |

### auth_accounts（既存）

変更なし。将来 `Provider` enum に `TIKTOK`, `TWITTER`, `INSTAGRAM` を追加予定。

### follows

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | フォローID |
| follower_id | int | FK → users, NOT NULL | フォローする側 |
| following_id | int | FK → users, NOT NULL | フォローされる側 |
| created_at | timestamp | NOT NULL | フォロー日時 |

制約: `@@unique([follower_id, following_id])`
インデックス: `follower_id`, `following_id`

### blocks

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ブロックID |
| blocker_id | int | FK → users, NOT NULL | ブロックする側 |
| blocked_id | int | FK → users, NOT NULL | ブロックされる側 |
| created_at | timestamp | NOT NULL | ブロック日時 |

制約: `@@unique([blocker_id, blocked_id])`
インデックス: `blocker_id`, `blocked_id`

### stamp_masters

スタンプのマスターデータ。Admin 画面から管理。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | スタンプID |
| name | varchar(100) | NOT NULL | スタンプ名 |
| image_url | varchar(500) | nullable | スタンプ画像URL |
| emoji | varchar(10) | NOT NULL | 絵文字（画像フォールバック） |
| category | StampCategory | NOT NULL | GENERAL / BATTLE / MATCHING |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| is_active | boolean | NOT NULL, default: true | 有効フラグ |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

### talk_themes

トークテーマのマスターデータ。マッチングとバトルで共用。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | テーマID |
| title | varchar(255) | NOT NULL | テーマタイトル |
| category | TalkThemeCategory | NOT NULL | MATCHING / BATTLE |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| is_active | boolean | NOT NULL, default: true | 有効フラグ |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

### talk_theme_choices

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | 選択肢ID |
| theme_id | int | FK → talk_themes, NOT NULL | テーマID |
| label | varchar(100) | NOT NULL | 選択肢ラベル |
| emoji | varchar(10) | NOT NULL | 選択肢の絵文字 |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| created_at | timestamp | NOT NULL | 作成日時 |

---

## API 設計

### 共通仕様

**ベース URL**: `http://localhost:8080/api`（開発）

**認証**: `Authorization: Bearer {accessToken}` ヘッダー

**エラーレスポンス**: `{ "error": "...", "status_code": 400 }`

**ページネーション**: カーソルベース `?cursor=10&limit=20` → `{ data, next_cursor, has_more }`

### 認証 API

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | `/api/auth/google` | 不要 | Google OAuth 認証コードを検証し、ユーザーを作成/更新した上で JWT（Access Token + Refresh Token）を発行する |
| POST | `/api/auth/refresh` | Refresh Token | Refresh Token を検証し、新しい Access Token と Refresh Token を発行する（ローテーション） |
| POST | `/api/auth/logout` | Access Token | Refresh Token を無効化し、セッションを終了する |
| GET | `/api/auth/me` | Access Token | ログイン中のユーザー情報を返却する |

### ユーザー API

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/users/:id` | Access Token | 指定ユーザーのプロフィール情報（ライブ状態、フォロー数、関係性含む）を取得する |
| PUT | `/api/users/:id` | Access Token | 自分のプロフィール（name, bio, avatar_url）を更新する |
| POST | `/api/users/:id/follow` | Access Token | 指定ユーザーをフォローする |
| DELETE | `/api/users/:id/follow` | Access Token | 指定ユーザーのフォローを解除する |
| POST | `/api/users/:id/block` | Access Token | 指定ユーザーをブロックする（既存フォロー関係も双方向で削除） |
| DELETE | `/api/users/:id/block` | Access Token | 指定ユーザーのブロックを解除する |
| GET | `/api/users/:id/followers` | Access Token | フォロワー一覧を取得する |
| GET | `/api/users/:id/following` | Access Token | フォロー中一覧を取得する |

### マスターデータ API

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/stamps` | Access Token | 有効なスタンプ一覧を取得する。`category` クエリでフィルタ可能 |
| GET | `/api/talk-themes` | Access Token | 有効なトークテーマ一覧を取得する。`category` クエリでフィルタ |
| GET | `/api/talk-themes/:id` | Access Token | トークテーマの詳細（タイトル + 選択肢一覧）を取得する |

### Webhook API

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | `/api/webhooks/livekit` | Webhook Secret | LiveKit のイベントを受信し DB 状態を同期する。配信の `is_live` 更新、マッチング/バトルの終了処理など |

### Admin API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/stamps` | スタンプ一覧（無効なものも含む） |
| POST | `/api/admin/stamps` | スタンプ新規登録 |
| PUT | `/api/admin/stamps/:id` | スタンプ更新 |
| DELETE | `/api/admin/stamps/:id` | スタンプ論理削除 |
| GET | `/api/admin/talk-themes` | テーマ一覧（選択肢付き） |
| POST | `/api/admin/talk-themes` | テーマ + 選択肢の新規登録 |
| PUT | `/api/admin/talk-themes/:id` | テーマ + 選択肢の更新 |
| DELETE | `/api/admin/talk-themes/:id` | テーマ論理削除 |
| GET | `/api/admin/users` | ユーザー一覧 |
| GET | `/api/admin/users/:id` | ユーザー詳細 |

---

## UI 設計

### 共通レイアウト

**ナビゲーションバー（上部 56px）**:
- 左: アプリロゴ（パープル）
- 中央: 検索バー（`#18181b` 背景）
- 右: 通知ベル、「マッチング開始」ボタン（パープル）、ユーザーアバター（ドロップダウン）

**サイドバー（左 240px / 折りたたみ 56px）**:
- ホーム、配信一覧、マッチング、バトル一覧のナビゲーション
- フォロー中ユーザー一覧（ライブ中を上部に表示）
- 背景: `#1f1f23`、アクティブ: `#9147ff1a` + 左ボーダー

### 共通コンポーネント

| コンポーネント | 説明 |
|--------------|------|
| `<CountdownOverlay>` | 3, 2, 1, START! のフルスクリーンオーバーレイ。`rgba(14,14,16,0.9)` + backdrop-blur。数字は120px パープルグロー。Framer Motion で scale + fade |
| `<StampPalette>` | 画面下部スライドアップ（280px）。カテゴリタブ + 4列グリッド。タップで即送信 |
| `<StampFloatLayer>` | ビデオ上のオーバーレイ。受信スタンプがランダム位置から上方向にフロート（2〜3秒）。同時30個上限。`pointer-events: none` |
| `<ThemeCard>` | トークテーマカード。パープルグラデーションヘッダー + 選択肢ボタン横並び。選択済みはパープル背景 |
| `<ConfettiEffect>` | `canvas-confetti` で紙吹雪。パープル + ホットピンク + ゴールド。3秒間 |
| `<TimerBar>` | 画面上部固定（4px）。パープル → 残り2分でアンバー → 残り30秒で赤+点滅 |

---

## Enum 定義（共通）

```typescript
enum StampCategory {
  GENERAL
  BATTLE
  MATCHING
}

enum TalkThemeCategory {
  MATCHING
  BATTLE
}
```
