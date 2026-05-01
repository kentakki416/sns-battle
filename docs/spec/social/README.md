# ソーシャル機能 設計書

## 目次

- [概要](#概要)
- [DB 設計](#db-設計)
- [API 設計](#api-設計)
- [UI 設計](#ui-設計)
  - [ホーム（/）](#ホーム)
  - [検索（/search）](#検索search)
  - [プロフィール（/profile）](#プロフィールprofile)
- [仕様詳細](#仕様詳細)
  - [フォロー/フォロー解除](#フォローフォロー解除)
  - [ブロック/ブロック解除](#ブロックブロック解除)
  - [ホームフィード](#ホームフィード)
  - [検索](#検索)
- [注意事項](#注意事項)

---

## 概要

ユーザー間のフォロー/ブロック、ホームフィード、検索機能。

---

## DB 設計

詳細は [common/README.md](../common/README.md) の `follows`, `blocks` テーブルを参照。

---

## API 設計

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| POST | `/api/users/:id/follow` | Access Token | フォローする。自分自身やブロック中は不可（400）。重複は 409 |
| DELETE | `/api/users/:id/follow` | Access Token | フォロー解除する |
| POST | `/api/users/:id/block` | Access Token | ブロックする。既存フォロー関係を双方向で削除 |
| DELETE | `/api/users/:id/block` | Access Token | ブロック解除する |
| GET | `/api/users/:id/followers` | Access Token | フォロワー一覧 |
| GET | `/api/users/:id/following` | Access Token | フォロー中一覧 |

---

## UI 設計

### 画面一覧

| パス | 画面名 | 認証 | レイアウトモード |
|------|--------|------|----------------|
| `/` | ホーム（フィード） | 不要 | default |
| `/search` | 検索 | 不要 | default |
| `/profile/:id` | プロフィール表示 | 不要 | default（詳細は [profile/README.md](../profile/README.md)）|

### ホーム（/）

ライブ配信・開催中バトル・募集中バトル・おすすめユーザーの 4 セクションを縦に並べた集約フィードページ。`apps/web/src/app/page.tsx`。

```
┌─────────────────────────────────────────────────────────────┐
│ [🔴] ライブ配信中  [N]                                      │
│ ┌───────┐ ┌───────┐ ┌───────┐  → 横スクロール              │
│ │サムネ │ │サムネ │ │サムネ │                              │
│ │  LIVE │ │  LIVE │ │  LIVE │                              │
│ └───────┘ └───────┘ └───────┘                              │
│                                                             │
│ [⚔️] 開催中のバトル  [N]                                    │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐  → 3 カラムグリッド │
│ │バトルカード│ │バトルカード│ │バトルカード│                │
│ └──────────┘ └──────────┘ └──────────┘                    │
│                                                             │
│ [🕐] 対戦相手募集中                                          │
│ ┌──────────┐ ┌──────────┐                                  │
│ │募集中カード│ │募集中カード│                                │
│ └──────────┘ └──────────┘                                  │
│                                                             │
│ [✨] おすすめユーザー                                        │
│ ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│ │ユーザーカード│ │ユーザーカード│ │ユーザーカード│            │
│ └────────────┘ └────────────┘ └────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

#### レイアウト

- **ルート**: `relative space-y-10`
- **背景装飾**: パープル orb（左上、`-left-1/4 top-0`、500px、`bg-primary/[0.03] blur-[120px]`）+ シアン orb（右下、`-right-1/4 bottom-0`、400px、`bg-cyan/[0.03] blur-[120px]`）
- **各セクションヘッダ**: `flex items-center gap-3 mb-5`
  - 32px 角丸正方形のアイコンボックス（背景は対応するアクセント色 `/10`）
  - セクションタイトル `text-lg font-bold`
  - 件数バッジ `bg-white/[0.03] text-xs text-text-muted`

| セクション | アイコン | アイコン背景 | 表示形式 | データソース |
|-----------|---------|------------|---------|-------------|
| ライブ配信中 | 赤の点滅ドット | `bg-error/10` | 横スクロール（`flex gap-4 overflow-x-auto pb-2`） | `streams WHERE is_live = true` を視聴者数降順 |
| 開催中のバトル | `⚔️` | `bg-accent-pink/10` | 3 カラムグリッド（`grid sm:grid-cols-2 lg:grid-cols-3 gap-4`） | `battle_rooms WHERE status = ACTIVE` を観戦者数降順 |
| 対戦相手募集中 | `🕐` | `bg-cyan/10` | 同上グリッド | `battle_rooms WHERE status = WAITING` を新しい順 |
| おすすめユーザー | `✨` | `bg-primary/10` | 3 カラムグリッド（`gap-3`） | フォローしていない、フォロワー数降順 |

#### データ取得

- Server Component で `apiClient.get` を使い、Express API から並列取得
- `revalidatePath("/")` をフォロー操作・配信開始/終了 Webhook で発火し、ライブ状態変化時にフィードを再生成

### 検索（/search）

`apps/web/src/app/search/page.tsx`。Client Component で `useState` によるローカル検索 + タブ切替を行う。

```
┌─────────────────────────────────────────────────────────────┐
│ [🔍 配信・ユーザー・バトルを検索...                       ] │ ← オートフォーカス
│                                                             │
│ [すべて] [配信] [ユーザー] [バトル]   ← タブ                │
│                                                             │
│ （クエリ未入力時）                                           │
│              🔍                                              │
│   キーワードを入力して検索してください                       │
│                                                             │
│ （クエリ入力時、タブで絞り込み）                             │
│ 📺 配信                                                      │
│ [配信カード] [配信カード] [配信カード]                       │
│                                                             │
│ 👤 ユーザー                                                  │
│ [ユーザーカード] [ユーザーカード] ...                        │
│                                                             │
│ ⚔️ バトル                                                   │
│ [バトルカード] [バトルカード] ...                            │
└─────────────────────────────────────────────────────────────┘
```

#### レイアウト

- **背景装飾**: パープル + シアン 2 個の blur オーブ
- **検索バー**: `rounded-2xl px-4 py-4`、左にアイコン、`border border-white/[0.08] bg-dark-surface/50` + `backdrop-blur-sm`
  - フォーカス時: パープル枠 + パープルグロー（`focus:shadow-[0_0_20px_rgba(203,172,249,0.08)]`）
  - `autoFocus` で初期フォーカス
- **タブ**: `glass-card` カード内に `flex gap-1 p-1`、4 タブ（`すべて` / `配信` / `ユーザー` / `バトル`）
  - アクティブタブ: `bg-gradient-to-r from-primary to-cyan text-dark-base shadow-[0_0_12px_rgba(203,172,249,0.15)]`
  - 非アクティブ: `text-text-muted`、ホバーで白
- **空状態**（クエリ未入力）: 中央に大きな🔍 + メッセージ
- **検索結果**: タブ条件で対応するセクションを表示
  - 配信: 横スクロール
  - ユーザー: 2 カラムグリッド
  - バトル: 3 カラムグリッド

#### データ取得

- ナビバー検索ボックス → Enter で `/search?q=...` に遷移
- 「すべて」タブは `/api/streams/search?q=`、`/api/users/search?q=`、`/api/battles/search?q=` を並列呼び出し
- 個別タブ選択時は対応エンドポイントのみ呼ぶ
- debounce 300ms で API 呼び出し（クライアント側）

### カードコンポーネント

ホーム・検索・プロフィール等で再利用する 3 種のカードコンポーネント。

#### `<StreamCard stream>`（apps/web/src/components/features/stream-card.tsx）

```
┌──────────────────────────────┐
│ [LIVE] ┌────────────┐       │
│        │  サムネイル  │       │ ← グラデ背景の box（aspect-video）
│        │            │       │
│        └────────[👁1.2k]┘   │
├──────────────────────────────┤
│ [Avatar]  配信タイトル       │
│           配信者名           │
└──────────────────────────────┘
```

- **コンテナ**: `<Link href="/stream/{hostName}">`、`glass-card flex min-w-[280px] flex-col rounded-2xl`
- **ホバー**: `translate-y-[-2px]` + `shadow: 0_8px_30px_rgba(203,172,249,0.08)`
- **サムネイル**: `aspect-video bg-gradient-to-br {thumbnailColor}`、上に `<LiveBadge>` 左上、視聴者数バッジ右下（`bg-dark-base/60 backdrop-blur-sm`）
- **下部情報**: 40px 円形アバター + タイトル（`text-sm font-semibold`、ホバーで `text-primary`）+ 配信者名（`text-xs text-text-muted`）

#### `<BattleCard battle>`（apps/web/src/components/features/battle-card.tsx）

```
┌──────────────────────────────────────┐
│ きのこ vs たけのこ          [LIVE]   │ ← タイトル + ステータスバッジ
│                                      │
│ [🍫] チョコ派    VS    キャンディ [🍬]│ ← VS レイアウト
│                                      │
│ ┌────────────────────────────────┐  │ ← スタンプカウントバー（live 時のみ）
│ │═══════ 53% ║ 47% ═══════│       │
│ └────────────────────────────────┘  │
│ 42 votes              38 votes      │
│                                      │
│ 👁 150人が観戦中                     │
└──────────────────────────────────────┘
```

- **コンテナ**: `<Link href="/battles/{id}">`、`glass-card flex flex-col rounded-2xl p-5`
- **ホバー**: `translate-y-[-2px]` + パープルグロー
- **タイトル + ステータス**:
  - LIVE: `<LiveBadge>`
  - WAITING: パープル+シアン枠の「募集中」バッジ（`bg: rgba(14,165,233,0.15)` + 1px シアン枠、文字 `#0EA5E9`）
  - FINISHED: グレーの「終了」バッジ
- **VS レイアウト**: 左にホスト（44px 角丸 + パープルグラデ背景）、中央に 32px 円形 VS バッジ、右に対戦相手（44px 角丸 + ピンクグラデ）
  - WAITING の場合、対戦相手は `???` + `❓`
- **スタンプカウントバー**（LIVE かつ totalStamps > 0 のみ）: 高さ 6px、左右にせり出すプログレスバー
  - 左: `bg-gradient-to-r from-primary to-primary-light`
  - 右: `bg-gradient-to-r from-pink-light to-accent-pink`
  - 下に `{host} votes` （パープル文字）と `{opponent} votes`（ピンク文字）
- **観戦者数**: LIVE 時のみ `👁 {spectators}人が観戦中`（`text-[11px] text-text-disabled`）
- **参加ボタン**（WAITING 時のみ）: 全幅、`bg-gradient-to-r from-cyan to-primary`

#### `<UserCard user>`（apps/web/src/components/features/user-card.tsx）

```
┌──────────────────────────────────────────┐
│ [Avatar]  ユーザー名 [LIVE]   [フォロー] │
│           bio がここに入ります             │
│           1,234 フォロワー                │
└──────────────────────────────────────────┘
```

- **コンテナ**: `<Link href="/profile/{id}">`、`glass-card flex items-center gap-4 rounded-2xl p-4`
- **アバター**: 48px 円形、パープル+シアングラデ背景。LIVE 中は右下に緑のドット（`bg-success` + 暗背景の枠）
- **中央テキスト**: 名前 + LIVE バッジ（配信中時）+ bio + `{followers.toLocaleString()} フォロワー`
- **フォローボタン**: 右側、`bg-primary-glow border border-primary/30 text-primary`、ホバーで濃色化。クリックは `e.preventDefault()` で `<Link>` 遷移を阻止し、`POST /api/users/:id/follow` を実行

---

## 仕様詳細

### フォロー/フォロー解除

- 配信視聴ページ、バトルルーム、プロフィールから操作
- サイドバーにフォロー中ユーザー表示（ライブ中を上部に）

### ブロック/ブロック解除

- プロフィールの「...」メニューから操作。確認ダイアログあり
- ブロック効果: 配信視聴不可、バトル参加/観戦不可、マッチング除外

### ホームフィード

1. ライブ配信中（視聴者数順、フォロー中優先）
2. 開催中バトル（スタンプ数順）
3. 募集中バトル（新しい順）
4. おすすめユーザー（未フォロー、フォロワー数順）

### 検索

- ユーザー名、配信タイトル、バトルタイトルを `ILIKE` 部分一致
- debounce 300ms

---

## 注意事項

- 自分自身のフォロー/ブロックはサーバーサイドで拒否
- ブロックは双方向に効果
- ホームフィードは `revalidatePath("/")` でライブ状態変化時に更新
