# 共通基盤 設計書

## 目次

- [概要](#概要)
- [DB 設計](#db-設計)
  - [users（既存 + 拡張）](#users既存--拡張)
  - [auth_accounts（既存）](#auth_accounts既存)
  - [follows](#follows)
  - [blocks](#blocks)
  - [アイテム・課金系テーブル設計方針](#アイテム課金系テーブル設計方針)
  - [items](#items)
  - [item_scopes](#item_scopes)
  - [stamp_details](#stamp_details)
  - [effect_details（将来フェーズ）](#effect_details将来フェーズ)
  - [boost_details（将来フェーズ）](#boost_details将来フェーズ)
  - [user_inventory（将来フェーズ）](#user_inventory将来フェーズ)
  - [coin_transactions（将来フェーズ）](#coin_transactions将来フェーズ)
  - [talk_themes](#talk_themes)
  - [talk_theme_choices](#talk_theme_choices)
  - [Phase 0 からの migration 方針](#phase-0-からの-migration-方針)
- [API 設計](#api-設計)
  - [共通仕様](#共通仕様)
  - [認証 API](#認証-api)
  - [ユーザー API](#ユーザー-api)
  - [アイテム・マスターデータ API](#アイテムマスターデータ-api)
  - [課金 API（将来フェーズ）](#課金-api将来フェーズ)
  - [Webhook API](#webhook-api)
  - [Admin API](#admin-api)
- [UI 設計](#ui-設計)
  - [共通レイアウト](#共通レイアウト)
  - [共通コンポーネント](#共通コンポーネント)
- [Enum 定義（共通）](#enum-定義共通)
- [実装ロードマップ](#実装ロードマップ)

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

### アイテム・課金系テーブル設計方針

スタンプ・エフェクト・ブースト・装飾アイテム等、ショップで売る/配布する全アイテムを単一の `items` 親テーブルに集約し、種別固有のデータは `*_details` テーブルに 1対1 で持たせる **Class Table Inheritance** パターンを採用する。

**設計上のポイント**:

1. **拡張性**: 新しい種別（例: `DECORATION` プロフィール装飾）を追加する場合、`*_details` テーブル1つと `ItemType` enum に1行追加するだけで済む。`items` / `user_inventory` / `coin_transactions` はスキーマ無変更。
2. **使用シーンの多重化**: アイテムが「マッチングとバトル両方で使えるスタンプ」のように複数シーンで利用可能な場合、`item_scopes` join テーブルで多対多を表現する。配列カラムではなく正規化することで B-tree インデックスによる高速フィルタ（「マッチング用アイテム一覧」）を可能にする。
3. **負荷対策**: マスター系テーブル（`items` + `*_details` + `item_scopes`）は数百〜数千行規模で安定するため、**Redis に全件キャッシュ前提**。ホットパスである `user_inventory` は単一 FK 構造で複合インデックスを2カラムに抑える。
4. **取引履歴のスケーラビリティ**: `coin_transactions` は時系列で線形増加するため、将来 `created_at` での range partitioning と古いデータのアーカイブを見据えた設計とする。

### items

全アイテムの親エンティティ。ショップ表示・所持品・取引履歴の単一参照点。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | アイテムID |
| type | ItemType | NOT NULL | STAMP / EFFECT / BOOST / DECORATION / SUBSCRIPTION |
| name | varchar(100) | NOT NULL | アイテム名 |
| description | text | nullable | 説明文（ショップ用） |
| price | int | NOT NULL, default: 0 | 価格（コイン単位、0=無料） |
| is_premium | boolean | NOT NULL, default: false | 有料アイテムか |
| is_active | boolean | NOT NULL, default: true | 有効フラグ（論理削除） |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

インデックス: `(type, is_active, sort_order)`（ショップ一覧用）

### item_scopes

アイテムが使用可能なシーンを表現する多対多 join テーブル。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| item_id | int | FK → items, NOT NULL, ON DELETE CASCADE | アイテムID |
| scope | Scope | NOT NULL | MATCHING / BATTLE / STREAMING / PROFILE |

制約: `@@id([item_id, scope])`（複合主キー）
インデックス: `(scope, item_id)`（シーン別フィルタ用 B-tree）

**運用ルール**:
- すべてのシーンで使えるスタンプ（旧 `category=GENERAL`）は `MATCHING` / `BATTLE` / `STREAMING` の3行を挿入する
- `PROFILE` は将来の装飾アイテム用（フレーム、背景等）
- 複数シーン横断のクエリは `WHERE scope = 'MATCHING'` の単純条件で済むため B-tree で O(log n) アクセス

### stamp_details

`items.type = 'STAMP'` のアイテムに紐づく種別固有データ。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| item_id | int | PK, FK → items, ON DELETE CASCADE | アイテムID（1対1） |
| emoji | varchar(10) | NOT NULL | 絵文字（画像フォールバック） |
| image_url | varchar(500) | nullable | スタンプ画像URL |
| animation_type | AnimationType | NOT NULL, default: FLOAT | アニメーション種別（NONE / FLOAT / BOUNCE / EXPLODE / SHAKE） |

### effect_details（将来フェーズ）

`items.type = 'EFFECT'` のアイテムに紐づく種別固有データ。マッチング・バトル中に使用できる視覚エフェクト（紙吹雪、花火等）。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| item_id | int | PK, FK → items, ON DELETE CASCADE | アイテムID（1対1） |
| effect_type | EffectType | NOT NULL | CONFETTI / FIREWORKS / HEARTS / CUSTOM |
| preview_url | varchar(500) | nullable | プレビュー動画/画像URL |
| duration_ms | int | NOT NULL, default: 3000 | エフェクト再生時間（ms） |

### boost_details（将来フェーズ）

`items.type = 'BOOST'` のアイテムに紐づく種別固有データ。マッチング優先券、時間延長券等の消費型アイテム。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| item_id | int | PK, FK → items, ON DELETE CASCADE | アイテムID（1対1） |
| boost_type | BoostType | NOT NULL | MATCH_PRIORITY / EXTEND_TIME / SKIP_QUEUE |
| duration_seconds | int | nullable | 効果持続時間（秒）。null は即時消費型 |

### user_inventory（将来フェーズ）

ユーザーが購入・所持しているアイテム。`items.id` への単一 FK で全種別を統一管理。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, NOT NULL | ユーザー |
| item_id | int | FK → items, NOT NULL | アイテム |
| quantity | int | NOT NULL, default: 1 | 所持数（消費型は >1 になりうる、永続型は常に1） |
| acquired_at | timestamp | NOT NULL | 取得日時 |
| expires_at | timestamp | nullable | 失効日時（サブスク・期間限定アイテム用、永続型は null） |

制約: `@@unique([user_id, item_id])`
インデックス: `user_id`、`expires_at`（失効バッチ用）

**永続型（STAMP / EFFECT / DECORATION）**: `quantity = 1`、`expires_at = null`
**消費型（BOOST）**: `quantity` を都度デクリメント。0 になったら行削除
**期間型（SUBSCRIPTION）**: `quantity = 1`、`expires_at` に失効日時設定。再購入時は `expires_at` を延長

### coin_transactions（将来フェーズ）

コインの取引履歴。購入・消費・ボーナス付与を記録。アイテム購入時は `related_item_id` で対象を参照。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, NOT NULL | ユーザー |
| amount | int | NOT NULL | コイン数（正=購入/付与、負=消費） |
| type | TransactionType | NOT NULL | PURCHASE / SPEND / BONUS / REFUND |
| related_item_id | int | FK → items, nullable | 消費取引のときの対象アイテム（PURCHASE のコイン購入時は null） |
| description | varchar(255) | nullable | 取引内容（補足メモ） |
| created_at | timestamp | NOT NULL | 取引日時 |

インデックス: `(user_id, created_at)`、`related_item_id`

**将来の運用**: 行数が大きくなる想定のため、`created_at` の月単位 range partitioning でスケールさせる。1年以上前のデータはコールドストレージへアーカイブ。

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

### Phase 0 からの migration 方針

Phase 0 で作成済みの `stamp_masters` テーブルを `items` + `stamp_details` + `item_scopes` に分解する。Spec1 リリース前であり実データがほぼ無いため、**ダウンタイム不要のクリーン移行**を採用する。

**実施時期**: **Spec1 リリース前（Phase 4 マッチング実装に先行）**。マッチング機能でスタンプ送信 API が `items` を参照するため、Phase 4 着手前に統合を完了させる必要がある。実装手順の詳細は [step9-db-migrate-stamp-to-items.md](./step9-db-migrate-stamp-to-items.md) を参照。

**migration 手順サマリ**（単一トランザクション）:

1. `items`、`item_scopes`、`stamp_details`、`effect_details`、`boost_details`、`user_inventory`、`coin_transactions` を新規作成
2. `stamp_masters` の既存行を `items`（type=STAMP）と `stamp_details` に分割コピー
3. `stamp_masters.category` を `item_scopes` の対応する `scope` 行に変換
   - `GENERAL` → `MATCHING` / `BATTLE` / `STREAMING` の3行
   - `MATCHING` / `BATTLE` → 同名 `scope` 1行
4. `stamp_masters` テーブルを drop
5. `StampCategory` enum を削除し、`Scope` enum を追加

`coin_transactions` は Spec6 着手時に追加してもよいが、`users.coin_balance` の整合性を取るため初期から空テーブルを用意しておくことを推奨。

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

### アイテム・マスターデータ API

アイテム関連は `items` テーブルに集約された設計のため、エンドポイントもアイテム単位で統一する。`type` と `scope` クエリで種別・シーンをフィルタ。

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/items` | Access Token | 有効なアイテム一覧を取得する。`type=STAMP\|EFFECT\|...` と `scope=MATCHING\|BATTLE\|...` でフィルタ。レスポンスは type に応じて該当 details が展開される |
| GET | `/api/items/:id` | Access Token | アイテム詳細（type 別 details と scopes 含む）を取得する |
| GET | `/api/talk-themes` | Access Token | 有効なトークテーマ一覧を取得する。`category` クエリでフィルタ |
| GET | `/api/talk-themes/:id` | Access Token | トークテーマの詳細（タイトル + 選択肢一覧）を取得する |

**`GET /api/items` レスポンス例**（`?type=STAMP&scope=MATCHING`）:

```json
{
  "data": [
    {
      "id": 1,
      "type": "STAMP",
      "name": "ハート",
      "description": null,
      "price": 0,
      "isPremium": false,
      "scopes": ["MATCHING", "BATTLE", "STREAMING"],
      "stampDetail": {
        "emoji": "❤️",
        "imageUrl": null,
        "animationType": "FLOAT"
      }
    }
  ]
}
```

### 課金 API（将来フェーズ）

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/me/inventory` | Access Token | 自分の所持アイテム一覧を取得する。`type` でフィルタ可能 |
| GET | `/api/me/coin-balance` | Access Token | 自分のコイン残高を取得する |
| GET | `/api/me/coin-transactions` | Access Token | コイン取引履歴をページネーションで取得する |
| POST | `/api/items/:id/purchase` | Access Token | アイテムを購入する（コイン消費 + user_inventory 更新 + coin_transactions 記録をトランザクション内で実行） |
| POST | `/api/coins/purchase` | Access Token | コインを購入する（IAP / Stripe レシート検証 → users.coin_balance 加算 + coin_transactions 記録） |

### Webhook API

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | `/api/webhooks/livekit` | Webhook Secret | LiveKit のイベントを受信し DB 状態を同期する。配信の `is_live` 更新、マッチング/バトルの終了処理など |

### Admin API

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/admin/items` | アイテム一覧（無効なものも含む）。`type` でフィルタ可能 |
| POST | `/api/admin/items` | アイテム新規登録（type 別 details と scopes をリクエストボディに含める） |
| PUT | `/api/admin/items/:id` | アイテム更新（details と scopes 含む） |
| DELETE | `/api/admin/items/:id` | アイテム論理削除（`is_active = false`） |
| GET | `/api/admin/talk-themes` | テーマ一覧（選択肢付き） |
| POST | `/api/admin/talk-themes` | テーマ + 選択肢の新規登録 |
| PUT | `/api/admin/talk-themes/:id` | テーマ + 選択肢の更新 |
| DELETE | `/api/admin/talk-themes/:id` | テーマ論理削除 |
| GET | `/api/admin/users` | ユーザー一覧 |
| GET | `/api/admin/users/:id` | ユーザー詳細 |
| GET | `/api/admin/coin-transactions` | コイン取引履歴（全ユーザー横断、`user_id` フィルタ可、不正検知用） |

**`POST /api/admin/items` リクエストボディ例**（スタンプ）:

```json
{
  "type": "STAMP",
  "name": "ハート",
  "description": null,
  "price": 0,
  "isPremium": false,
  "isActive": true,
  "sortOrder": 0,
  "scopes": ["MATCHING", "BATTLE", "STREAMING"],
  "stampDetail": {
    "emoji": "❤️",
    "imageUrl": null,
    "animationType": "FLOAT"
  }
}
```

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
- マスターデータ API（`GET /api/items?type=STAMP&scope=MATCHING\|BATTLE\|STREAMING`）から取得した `items` + `stamp_details` を表示
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

/**
 * アイテムの種別。新カテゴリを増やす場合は対応する *_details テーブルを追加する
 */
enum ItemType {
  STAMP
  EFFECT
  BOOST
  DECORATION
  SUBSCRIPTION
}

/**
 * アイテムが使用可能なシーン。item_scopes で多対多管理
 */
enum Scope {
  MATCHING
  BATTLE
  STREAMING
  PROFILE
}

enum AnimationType {
  NONE
  FLOAT
  BOUNCE
  EXPLODE
  SHAKE
}

enum EffectType {
  CONFETTI
  FIREWORKS
  HEARTS
  CUSTOM
}

enum BoostType {
  MATCH_PRIORITY
  EXTEND_TIME
  SKIP_QUEUE
}

enum TalkThemeCategory {
  MATCHING
  BATTLE
}

enum TalkThemeType {
  CHOICE
  FREE_TALK
}

enum TransactionType {
  PURCHASE
  SPEND
  BONUS
  REFUND
}
```

---

## 実装ロードマップ

共通基盤の実装は2ブロックに分かれる:

- **Phase 2（UI 基盤）**: `<AppShell>` を起点とした共通 UI コンポーネント群（step1-8）。`apps/web` 配下のみ
- **Spec1 リリース前の DB 統合（step9）**: `stamp_masters` を `items` 系へ統合。Phase 4 マッチング着手前に必須

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
| step9 | DB: stamp_masters → items 統合 | Phase 0 の `stamp_masters` を `items` + `stamp_details` + `item_scopes` に再構成。`effect_details` / `boost_details` / `user_inventory` / `coin_transactions` も同時に空テーブルとして作成 | Phase 0 完了 | [step9-db-migrate-stamp-to-items.md](./step9-db-migrate-stamp-to-items.md) |

### 全 step 共通の方針

- step1-8 はすべて `apps/web` 配下のみを変更（API 側の変更なし）
- step9 は `apps/api/src/prisma/schema.prisma` と migration、seed、関連 TS コードのみを変更
- 動作確認用の一時プレビューページ（`apps/web/src/app/dev/<component>/page.tsx`）は **当該 step の確認後に削除する**。Phase 2 完了時点で `dev/` ディレクトリ自体が存在しないこと
- Lint（`cd apps/web && pnpm lint` / `cd apps/api && pnpm lint`）が通ること
- `<StampPalette>` / `<StampFloatLayer>` は VideoChatOverlay（step5）の内蔵 / 配信ページ実装時（Phase 6）に切り出すため Phase 2 では独立 step を立てない
