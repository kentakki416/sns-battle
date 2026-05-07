# 共通基盤 設計書

## 目次

- [概要](#概要)
- [DB 設計](#db-設計)
  - [users（既存 + 拡張）](#users既存--拡張)
  - [auth_accounts（既存）](#auth_accounts既存)
  - [follows](#follows)
  - [blocks](#blocks)
  - [stamp_masters](#stamp_masters)
  - [effects（将来フェーズ）](#effects将来フェーズ)
  - [user_inventory（将来フェーズ）](#user_inventory将来フェーズ)
  - [coin_transactions（将来フェーズ）](#coin_transactions将来フェーズ)
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
- [実装ロードマップ（Phase 2）](#実装ロードマップphase-2)

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
| birth_date | date | NOT NULL | 生年月日（年齢は計算で算出） | **追加（Spec1）** |
| gender | Gender | NOT NULL | 性別（MALE / FEMALE / OTHER） | **追加（Spec1）** |
| is_onboarded | boolean | NOT NULL, default: false | 初期設定完了フラグ | **追加** |
| mbti | varchar(4) | nullable | MBTI タイプ（将来フェーズ） | **追加（nullable）** |
| location | varchar(100) | nullable | 居住地域（将来フェーズ） | **追加（nullable）** |
| coin_balance | int | NOT NULL, default: 0 | コイン残高（将来フェーズ） | **追加** |
| created_at | timestamp | NOT NULL | 作成日時 | 既存 |
| updated_at | timestamp | NOT NULL | 更新日時 | 既存 |

### auth_accounts（既存）

変更なし。将来 `Provider` enum に `TIKTOK`, `TWITTER`, `INSTAGRAM` を追加予定。

### follows

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | フォローID |
| follower_id | int | FK → users, NOT NULL | フォローする側 |
| followee_id | int | FK → users, NOT NULL | フォローされる側 |
| created_at | timestamp | NOT NULL | フォロー日時 |

制約: `@@unique([follower_id, followee_id])`
インデックス: `follower_id`, `followee_id`

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
| animation_type | AnimationType | NOT NULL, default: FLOAT | アニメーション種別（NONE / FLOAT / BOUNCE / EXPLODE / SHAKE） |
| is_premium | boolean | NOT NULL, default: false | 有料スタンプか |
| price | int | NOT NULL, default: 0 | 価格（コイン単位、0=無料） |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| is_active | boolean | NOT NULL, default: true | 有効フラグ |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

### effects（将来フェーズ）

エフェクトのマスターデータ。マッチング・バトル中に使用できる視覚エフェクト。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | エフェクトID |
| name | varchar(100) | NOT NULL | エフェクト名（紙吹雪、花火等） |
| type | EffectType | NOT NULL | CONFETTI / FIREWORKS / HEARTS / CUSTOM |
| preview_url | varchar(500) | nullable | プレビュー動画/画像URL |
| is_premium | boolean | NOT NULL, default: false | 有料か |
| price | int | NOT NULL, default: 0 | 価格（コイン単位） |
| duration_ms | int | NOT NULL, default: 3000 | エフェクト再生時間（ms） |
| is_active | boolean | NOT NULL, default: true | 有効フラグ |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

### user_inventory（将来フェーズ）

ユーザーが購入した有料スタンプ・エフェクトの所持品。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, NOT NULL | ユーザー |
| item_type | ItemType | NOT NULL | STAMP / EFFECT |
| item_id | int | NOT NULL | stamp_masters.id or effects.id |
| purchased_at | timestamp | NOT NULL | 購入日時 |

制約: `@@unique([user_id, item_type, item_id])`

### coin_transactions（将来フェーズ）

コインの取引履歴。購入・消費・ボーナス付与を記録。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, NOT NULL | ユーザー |
| amount | int | NOT NULL | コイン数（正=購入/付与、負=消費） |
| type | TransactionType | NOT NULL | PURCHASE / SPEND / BONUS / REFUND |
| description | varchar(255) | nullable | 取引内容 |
| created_at | timestamp | NOT NULL | 取引日時 |

インデックス: `(user_id, created_at)`

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

ルートレイアウトは `apps/web/src/app/layout.tsx` で `<AppShell>` を呼び出し、その内部で「フルスクリーンに振る舞うべきページ」と「ナビバー＋サイドバー付きページ」をパス単位で切り替える。

#### AppShell（apps/web/src/components/layout/app-shell.tsx）

`usePathname()` から現在のパスを取得し、3 種類の表示モードを判定する Client Component。

- **immersive モード**（ナビバー・サイドバーともに非表示の完全フルスクリーン）
  - 対象パス: `/sign-in`、`/stream/...`、`/matching/session`、`/battles/{id}`（一覧 `/battles` は除外）
  - レイアウト: `<main>` のみレンダリング。余白なし
- **no-sidebar モード**（ナビバーのみ表示、サイドバー非表示）
  - 対象パス: `/battles`（バトル一覧）
  - レイアウト: ナビバー + `<main className="mt-14 p-6">`
- **default モード**（ナビバー + サイドバー）
  - 対象パス: 上記以外（`/`、`/matching`、`/matching/result`、`/profile/...`、`/search` 等）
  - レイアウト: ナビバー + サイドバー + `<main className="ml-60 mt-14 p-6">`

判定関数:
- `isBattleDetailPath(pathname)`: `pathname.startsWith("/battles/") && pathname !== "/battles"`
- `isImmersive`: `isBattleDetailPath || immersivePaths.some(p => pathname.startsWith(p))`
- `isNoSidebar`: `noSidebarPaths.includes(pathname)`

#### Navbar（上部固定 56px / `apps/web/src/components/layout/navbar.tsx`）

```
┌──────────────────────────────────────────────────────────────────┐
│ [⚡ロゴ] SNS Battle    [🔍 検索バー...]    [マッチング開始] [🔔3] [K] │
└──────────────────────────────────────────────────────────────────┘
```

- **配置**: `fixed left-0 right-0 top-0 z-50 h-14`、左右 padding `20px`
- **背景**: `rgba(17, 25, 40, 0.75)` + `backdrop-filter: blur(16px) saturate(180%)`
- **下境界**: `border-bottom: 1px solid rgba(255,255,255,0.08)`
- **左（ロゴ）**: `<Link href="/">`。32px 角丸正方形にパープル→シアングラデ背景、内側に `⚡` 絵文字。右に「SNS Battle」テキスト
- **中央（検索バー）**: `md:` 以上で表示。最大 `max-w-md`。背景 `bg-dark-base/50` + 左に `🔍` アイコン。Enter キーで `/search?q=...` に遷移
- **右（アクション群）**: 3 要素を `gap-3` で並べる
  1. 「マッチング開始」CTA: `<Link href="/matching">`。グラデ背景（`primary → cyan → primary`）+ ホバー時に `animate-shimmer` でシマー演出
  2. 通知ベル: `🔔` + 右上に `bg-accent-pink` の小バッジ（数字）
  3. ユーザーアバター: `<Link href="/profile/me">`。32px 円形にパープル→ピンクグラデ背景、ホバー時パープルグロー

#### Sidebar（左固定 240px / 折りたたみ 68px / `apps/web/src/components/layout/sidebar.tsx`）

```
┌────────────────────┐
│        ◂           │ ← 折りたたみトグル（中央）
│                    │
│ [🏠] ホーム        │ ← ナビゲーション
│ [📺] 配信          │
│ [🤝] マッチング    │   ← アクティブはパープル枠 + パープル背景
│ [⚔️] バトル        │
│ [🔍] 検索          │
│ [👤] プロフィール  │
│                    │
│ FOLLOWING          │ ← セクション見出し（uppercase, tracking-widest）
│ ─────────────────  │
│ 🎸 ギターマスター  │ ← フォロー中ユーザー
│   [LIVE] 1,234視聴 │
│ 🎮 ゲーマーX       │
│ 🎨 アート太郎      │
│                    │
│ ─────────────────  │
│ [K] ケンタ         │ ← 自分のプロフィールカード（最下部固定）
│     @kenta         │
└────────────────────┘
```

- **配置**: `fixed left-0 top-14 z-40 h-[calc(100vh-56px)]`、ナビバー直下から画面下まで
- **幅**: 展開時 `w-60` (240px) / 折りたたみ時 `w-[68px]`、`transition-all duration-300`
- **背景**: 縦グラデ `linear-gradient(180deg, rgba(4,7,29,0.95) 0%, rgba(12,14,35,0.9) 100%)` + `backdrop-filter: blur(12px)`
- **右境界**: `border-right: 1px solid rgba(255,255,255,0.05)`
- **折りたたみトグル**: 中央上部の小さな `◂ / ▸` ボタン（28px 角）
- **ナビゲーション項目**:
  - リスト: `[ホーム /, 配信 /stream/{user}, マッチング /matching, バトル /battles, 検索 /search, プロフィール /profile/me]`
  - アクティブ判定: `pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))`
  - アクティブスタイル: `bg-primary-glow` + `border border-primary-border` + `text-primary`
  - 非アクティブ: `text-text-muted` + ホバーで `bg-white/[0.03]` + `text-text-primary`
  - 折りたたみ時はアイコンのみ中央配置（`justify-center px-2`）
- **フォロー中セクション**:
  - 見出し: `text-[10px] uppercase tracking-widest text-text-disabled`「フォロー中」
  - 各項目: 絵文字アバター + 名前 + LIVE バッジ（配信中時のみ）+ 視聴者数
  - LIVE 中はアバター右下に緑のドット（`bg-success` + 暗背景の枠）
  - 折りたたみ時は LIVE 中ユーザーのみ円形アイコンで表示
- **下部プロフィールカード**:
  - `mt-auto` で最下部固定。上に `border-t border-white/[0.05]`
  - パープル→シアングラデ背景の角丸円アバター + 名前 + `@username`

### 共通コンポーネント

#### `<LiveBadge size?: "sm" | "md">`（apps/web/src/components/ui/live-badge.tsx）

LIVE 中であることを示すバッジ。

- **背景**: `linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.1) 100%)`
- **枠**: `1px solid rgba(239,68,68,0.3)`
- **文字色**: `#EF4444`（error）。`font-bold uppercase`
- **構成**: 左に点滅ドット（`h-1.5 w-1.5 bg-error animate-pulse rounded-full`）+「LIVE」テキスト
- **サイズ**:
  - `sm`（デフォルト）: `px-1.5 py-0.5 text-[10px] gap-1`
  - `md`: `px-2.5 py-1 text-xs gap-1.5`

#### `<VideoChatOverlay messages stampEmojis?>`（apps/web/src/components/ui/video-chat-overlay.tsx）

配信視聴ページとバトルルームで使う、ビデオ最下部に重ねるチャットオーバーレイ。

- **配置**: `absolute bottom-0 left-0 right-0`、`max-height: 60%`
- **構成（上から下）**:
  1. **コメント一覧**（スクロール可）: `[mask-image:linear-gradient(to_bottom,transparent_0%,black_30%)]` で上部フェードアウト。新着メッセージで自動スクロール（`scrollTop = scrollHeight`）
     - 各メッセージ: `<userName>` をユーザー固有色（HSL ハッシュベース）、`<message>` を白で並列表示。`drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]` で読みやすさ確保
  2. **スタンプパレット**（`showStamps` 時のみ）: 6列グリッド。デフォルトスタンプは絵文字 12 個（`["👍","🔥","😂","👏","💪","🎉","❤️","⭐","🏆","💯","😮","🤣"]`）。`stampEmojis` prop で上書き可能。背景 `rgba(0,3,25,0.7)` + blur
  3. **入力エリア**:
     - 左: 😀 ボタン（スタンプパレット開閉トグル。`showStamps` 時はパープル）
     - 中央: `<input>` 入力欄。背景 `rgba(0,3,25,0.5)` + blur + 1px 白枠
     - 右: 「送信」ボタン（パープル文字）

#### `<CountdownOverlay>`（マッチング・バトル共通仕様）

`/matching/session` のカウントダウン表示と同じパターンを共通化する想定。

- **配置**: `fixed inset-0 z-50 flex items-center justify-center`
- **背景**: `rgba(0,3,25,0.92)` + `backdrop-filter: blur(12px)`
- **数字**: `text-[140px] font-bold` + パープル→シアングラデ + `bg-clip-text text-transparent`
- **発光**: `filter: drop-shadow(0 0 60px rgba(203,172,249,0.4))`
- **シーケンス**: `["3", "2", "1", "START!"]` を 1 秒ごとに切替
- **アニメーション**: 各数字を Framer Motion `AnimatePresence mode="wait"` で `initial={scale: 0.3, opacity: 0}` → `animate={scale: 1, opacity: 1}` → `exit={scale: 1.5, opacity: 0}`、`duration: 0.3`

#### `<StampPalette>`（スタンプ送信用パレット）

ビデオチャット内（VideoChatOverlay 内蔵）または独立コンポーネント。

- カテゴリタブ + 絵文字グリッド構成
- マスターデータ API（`GET /api/stamps?category=...`）から取得した `stamp_masters` を表示
- タップで即送信 → Data Channel 送信 + 親へ通知

#### `<StampFloatLayer>`（受信スタンプの表示）

配信ページ・バトルルームで、受信したスタンプをビデオ上にフロート表示。

- **配置**: ビデオ要素の `absolute inset-0`、`pointer-events-none`
- **動作**: 受信スタンプをランダムな水平位置（`left: 20%-80%`）から上方向に 2 秒間フロート（`y: 0 → -200`）+ 透明度フェードアウト
- **同時表示上限**: 30 個。それ以上は最古から削除
- **アニメーション**: Framer Motion `motion.div` で `initial={opacity: 0.9, scale: 0.5, y: 0}` → `animate={opacity: 1, scale: 1, y: -200}` → `exit={opacity: 0}`

#### `<ConfettiEffect>`（紙吹雪）

マッチングのリアクション一致、バトル勝利時に表示。

- 推奨ライブラリ: `canvas-confetti`
- カラー: `#CBACF9`（パープル）+ `#EC4899`（ピンク）+ `#FBBF24`（ゴールド）+ `#0EA5E9`（シアン）
- 持続: 3 秒間。`spread: 70`、`particleCount: 100`

#### `<TimerBar progress remainingSec>`（マッチング・バトル共通）

画面上部固定の進行度バー。

- **配置**: `absolute top-0 left-0 right-0 h-1`（4px）
- **背景**: `bg-white/[0.08]`
- **進行バー**: グラデ `from-primary via-cyan to-primary`
- **色変化**:
  - 残り時間 ≤ 10 秒: グラデを `from-warning to-warning`（アンバー単色）に切替
  - 残り時間 ≤ 5 秒: `from-error to-error`（赤単色）+ `animate-pulse`
- **滑らかな縮小**: 各テーマ開始時に `key` を更新し、`@keyframes timer-shrink` を `${duration}s linear forwards` で適用

---

## Enum 定義（共通）

```typescript
enum Gender {
  MALE
  FEMALE
  OTHER
}

enum StampCategory {
  GENERAL
  BATTLE
  MATCHING
}

enum AnimationType {
  NONE
  FLOAT
  BOUNCE
  EXPLODE
  SHAKE
}

enum TalkThemeCategory {
  MATCHING
  BATTLE
}

enum TalkThemeType {
  CHOICE
  FREE_TALK
}

enum EffectType {
  CONFETTI
  FIREWORKS
  HEARTS
  CUSTOM
}

enum ItemType {
  STAMP
  EFFECT
}

enum TransactionType {
  PURCHASE
  SPEND
  BONUS
  REFUND
}
```

---

## 実装ロードマップ（Phase 2）

Phase 2 は本ファイルの「UI 設計」セクションで定義した共通レイアウトとコンポーネントを 1 コンポーネント = 1 step で実装する。各 step はテスト可能な最小単位として独立して PR を切る。

実装順は依存関係に従う。AppShell（step1）が骨組みで、Navbar（step2）/ Sidebar（step3）はその差込スロットを埋める。LiveBadge（step4）以降の単発 UI コンポーネントは並列実装可。

| step | 対象 | 内容 | 依存 | リンク |
|------|------|------|------|------|
| step1 | `<AppShell>` | パスごとに immersive / no-sidebar / default を切替 | - | [step1-web-app-shell.md](./step1-web-app-shell.md) |
| step2 | `<Navbar>` | ロゴ、検索バー、マッチング開始 CTA、通知、アバター | step1 | [step2-web-navbar.md](./step2-web-navbar.md) |
| step3 | `<Sidebar>` | ナビ + フォロー中ユーザー + 折りたたみ + プロフィールカード | step1 | [step3-web-sidebar.md](./step3-web-sidebar.md) |
| step4 | `<LiveBadge>` | LIVE 表示用バッジ | - | [step4-web-live-badge.md](./step4-web-live-badge.md) |
| step5 | `<VideoChatOverlay>` | コメント + スタンプパレット + 入力欄 | - | [step5-web-video-chat-overlay.md](./step5-web-video-chat-overlay.md) |
| step6 | `<CountdownOverlay>` | 3-2-1-START の全画面オーバーレイ | - | [step6-web-countdown-overlay.md](./step6-web-countdown-overlay.md) |
| step7 | `<TimerBar>` | 上部固定の進行度バー（色分け付き） | - | [step7-web-timer-bar.md](./step7-web-timer-bar.md) |
| step8 | `<ConfettiEffect>` | `canvas-confetti` ラッパー | - | [step8-web-confetti-effect.md](./step8-web-confetti-effect.md) |

### 全 step 共通の方針

- すべての step は `apps/web` 配下のみを変更（API 側の変更なし）
- 動作確認用の一時プレビューページ（`apps/web/src/app/dev/<component>/page.tsx`）は **当該 step の確認後に削除する**。Phase 2 完了時点で `dev/` ディレクトリ自体が存在しないこと
- Lint（`cd apps/web && pnpm lint`）が通ること
- `<StampPalette>` / `<StampFloatLayer>` は VideoChatOverlay（step5）の内蔵 / 配信ページ実装時（Phase 6）に切り出すため Phase 2 では独立 step を立てない
