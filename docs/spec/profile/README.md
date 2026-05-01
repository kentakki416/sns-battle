# プロフィール機能 設計書

## 目次

- [概要](#概要)
- [Spec1 スコープ](#spec1-スコープ)
- [DB 設計](#db-設計)
  - [users テーブル拡張](#users-テーブル拡張)
  - [matching_preferences](#matching_preferences)
- [API 設計](#api-設計)
- [UI 設計](#ui-設計)
  - [プロフィール表示（/profile/:id）](#プロフィール表示profileid)
  - [プロフィール編集（/profile/edit）](#プロフィール編集profileedit)
  - [オンボーディング（/onboarding）](#オンボーディングonboarding)
- [仕様詳細](#仕様詳細)
  - [年齢の計算](#年齢の計算)
  - [プロフィール公開範囲](#プロフィール公開範囲)
  - [マッチングフィルタリング（将来フェーズ）](#マッチングフィルタリング将来フェーズ)
  - [MBTI 連携（将来フェーズ）](#mbti-連携将来フェーズ)
- [注意事項](#注意事項)

---

## 概要

ユーザーのプロフィール管理機能。基本情報（名前、bio、アバター）に加え、生年月日・性別を管理する。年齢は生年月日から自動計算される。将来的にはマッチングのフィルタリング（性別・年齢範囲）やMBTI連携に活用する。

---

## Spec1 スコープ

| 項目 | Spec1 | 将来フェーズ |
|------|-------|------------|
| 基本情報（名前、bio、アバター） | 実装 | - |
| 生年月日・年齢表示 | 実装 | - |
| 性別（MALE / FEMALE / OTHER） | 実装 | - |
| プロフィール閲覧・編集 | 実装 | - |
| オンボーディング（生年月日・性別追加） | 実装 | - |
| マッチングフィルタリング | DB設計のみ | 実装 |
| MBTI | - | DB設計 + 実装 |
| 居住地域 | - | DB設計 + 実装 |

---

## DB 設計

### users テーブル拡張

既存の users テーブルに以下のカラムを追加する。

| カラム | 型 | 制約 | 説明 | 変更 |
|--------|------|------|------|------|
| id | int | PK, auto_increment | ユーザーID | 既存 |
| email | varchar | unique, nullable | メールアドレス | 既存 |
| name | varchar | nullable | 表示名 | 既存 |
| avatar_url | varchar | nullable | アバター画像URL | 既存 |
| bio | text | nullable | 自己紹介文 | 既存（auth spec で追加済み） |
| birth_date | date | NOT NULL | 生年月日（年齢は計算で算出） | **追加** |
| gender | Gender | NOT NULL | 性別（MALE / FEMALE / OTHER） | **追加** |
| is_onboarded | boolean | NOT NULL, default: false | 初期設定完了フラグ | 既存（auth spec で追加済み） |
| mbti | varchar(4) | nullable | MBTI タイプ（将来フェーズ） | **追加（nullable）** |
| location | varchar(100) | nullable | 居住地域（将来フェーズ） | **追加（nullable）** |
| coin_balance | int | NOT NULL, default: 0 | コイン残高（将来フェーズ） | **追加** |
| created_at | timestamp | NOT NULL | 作成日時 | 既存 |
| updated_at | timestamp | NOT NULL | 更新日時 | 既存 |

### matching_preferences

マッチング時のフィルタリング設定。ユーザーごとに1レコード。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, unique, NOT NULL | ユーザー |
| preferred_gender | Gender | nullable | 希望する相手の性別（null=指定なし） |
| age_min | int | nullable | 希望する最小年齢（null=制限なし） |
| age_max | int | nullable | 希望する最大年齢（null=制限なし） |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

### Enum 定義

```typescript
enum Gender {
  MALE
  FEMALE
  OTHER
}
```

---

## API 設計

### プロフィール API

| メソッド | パス | 認証 | Spec1 | 説明 |
|---------|------|------|-------|------|
| GET | `/api/users/:id` | Access Token | 実装 | プロフィール情報取得（年齢、性別含む） |
| PUT | `/api/users/:id` | Access Token | 実装 | プロフィール更新（name, bio, avatar_url, birth_date, gender） |
| PUT | `/api/users/:id/onboarding` | Access Token | 実装 | オンボーディング完了（name, bio, birth_date, gender を設定し is_onboarded=true） |

### マッチングフィルタ API（将来フェーズ）

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| GET | `/api/matching/preferences` | Access Token | 自分のフィルタ設定を取得 |
| PUT | `/api/matching/preferences` | Access Token | フィルタ設定を更新（preferred_gender, age_min, age_max） |

---

## UI 設計

### プロフィール表示（/profile/:id）

`apps/web/src/app/profile/[id]/page.tsx`。AppShell 上では default モード（ナビバー + サイドバー）。

```
┌─────────────────────────────────────────────────────┐
│  ┌─ glass-card ───────────────────────────────────┐ │
│  │ ━━ カバーグラデ（h-24 パープル/シアン/ピンク）━━ │ │
│  │                                                │ │
│  │  [Avatar 80px]   表示名                         │ │
│  │  （ring-4 dark）  自己紹介テキスト                │ │
│  │                                                │ │
│  │  1,234 フォロワー / 567 フォロー中  [フォロー][⋯]│ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  [📺] ライブ配信履歴                                 │
│  ┌─ glass-card ──────┐ ┌─ glass-card ──────┐       │
│  │ 配信タイトル         │ │ 配信タイトル         │     │
│  │ 📅 2026-04-25       │ │ 📅 2026-04-18       │     │
│  │ 👁 1,234            │ │ 👁 987              │     │
│  └─────────────────────┘ └─────────────────────┘     │
│                                                     │
│  [⚔️] バトル戦績                                    │
│  ┌─ glass-card ────────────────────────────────┐    │
│  │   12 WIN     5 LOSE     2 DRAW              │    │
│  │   ■■■■■■■■■■■□□□□□□□□□□□□□□（勝率バー）  │    │
│  └──────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────┘
```

#### レイアウト

- **コンテナ**: `relative mx-auto max-w-2xl`
- **背景装飾**: 左上に 500px パープル blur オーブ
- **プロフィールヘッダー**:
  - `glass-card overflow-hidden rounded-2xl` で囲む
  - **カバーグラデーション**: 高さ 96px、`bg-gradient-to-r from-primary/20 via-cyan/10 to-accent-pink/20`
  - **アバター + 名前**: カバーから 40px 食い込ませる（`-mt-10`）
    - 80px 角丸、パープル+シアングラデ背景 + `ring-4 ring-dark-base` + パープルグロー
    - 中身は絵文字（36px）。将来的に `avatar_url` がある場合は `<Image>` で差し替え
  - **名前と bio**: アバター右に縦並び。名前 `text-xl font-bold`、bio `text-sm text-text-muted`
  - **統計 + アクション**:
    - 左: `{followers.toLocaleString()} フォロワー` ・ `{following.toLocaleString()} フォロー中`（数字は太字、ラベルは muted）
    - 右: 「フォロー」ボタン（パープル→シアングラデ + `text-dark-base`）+ 「⋯」メニューボタン（border + neutral）
    - **自分のプロフィールの場合**: 「フォロー」を「プロフィール編集」に置き換える

- **ライブ配信履歴セクション**:
  - セクションヘッダ: 28px 角丸 `bg-error/10` の `📺` アイコン + `text-base font-bold` 「ライブ配信履歴」
  - 2 カラムグリッド（`grid sm:grid-cols-2 gap-3`）
  - 各履歴カード: `glass-card rounded-xl p-4`、ホバーで `translate-y-[-1px]` + パープルグロー
    - タイトル `text-sm font-semibold`
    - 下: `📅 {date}` `👁 {viewers.toLocaleString()}`（`text-[11px] text-text-disabled`）

- **バトル戦績セクション**:
  - セクションヘッダ: `bg-accent-pink/10` の `⚔️` アイコン + 「バトル戦績」
  - `glass-card rounded-xl p-5`
  - **3 列の数字ブロック**: WIN（緑）/ LOSE（赤）/ DRAW（グレー）。各 `text-3xl font-bold` の数字 + ラベル
  - **勝率バー**: 高さ 8px、`flex overflow-hidden rounded-full`
    - 左: WIN セグメント `bg-gradient-to-r from-success to-success/70`、幅 `winRate%`
    - 中: LOSE セグメント `bg-gradient-to-r from-error/70 to-error`、幅 `loseRate%`
    - 右: DRAW セグメント `bg-text-disabled/50`、幅 `drawRate%`

- **マッチング履歴セクション**（オプション、Spec1 完成後に追加）:
  - 「マッチング #1 2026-04-20 7/10 一致」のリスト形式
  - 履歴行クリックで `/matching/result?id={sessionId}` に遷移

#### データ要件

- プロフィール本体: `GET /api/users/:id`
  - 表示項目: `id, name, avatar_url, bio, followers_count, following_count, is_followed_by_me, is_live`
  - 自分のプロフィール時のみ追加で: `birth_date, gender, mbti（将来）, location（将来）`
- 配信履歴: `GET /api/streams?user_id=:id&past=true&limit=4`
- バトル戦績: `GET /api/users/:id/battle-stats` →`{ win, lose, draw }`
- マッチング履歴: `GET /api/users/:id/matching-history`（自分のみ）

#### タブ表示について

実装は配信履歴・バトル戦績を縦に並べる構成にしている。**タブは現状未実装**。タブ化する場合は `<MatchingHistory>` `<StreamHistory>` `<BattleStats>` を切替えるタブコンポーネントを追加する。

- **自分のプロフィール**: ヘッダー右の「フォロー」を「プロフィール編集」に差し替え（`<Link href="/profile/edit">`）

### プロフィール編集（/profile/edit）

```
┌─────────────────────────────────────────┐
│         プロフィール編集                 │
│                                         │
│   [Avatar]  [変更]                      │
│                                         │
│   表示名    [____________]              │
│   自己紹介  [__________________]        │
│   生年月日  [1998/05/15      ]          │
│   性別      [男性 ▼]                    │
│                                         │
│   [保存]                                │
└─────────────────────────────────────────┘
```

### オンボーディング（/onboarding）

初回ログイン後に表示。生年月日と性別を必須入力に追加。

```
┌─────────────────────────────────────────┐
│         はじめまして！                   │
│   プロフィールを設定しましょう           │
│                                         │
│   [Avatar Preview]                      │
│                                         │
│   表示名 *    [____________]            │
│   自己紹介    [__________________]      │
│   生年月日 *  [____/____/____]          │
│   性別 *      [男性] [女性] [その他]    │
│                                         │
│   [はじめる]                            │
└─────────────────────────────────────────┘
```

---

## 仕様詳細

### 年齢の計算

- サーバーサイドで `birth_date` から年齢を計算してレスポンスに含める
- 計算ロジック: `floor((today - birth_date) / 365.25)` または日付比較
- API レスポンスには `age: number` フィールドを含める（DB カラムではない）
- 18歳未満のユーザーは登録不可（バリデーションで弾く）

### プロフィール公開範囲

- **名前・アバター・bio**: 全ユーザーに公開
- **年齢**: マッチング相手にのみ表示（プロフィールページでは年代のみ表示も検討）
- **性別**: マッチング相手にのみ表示
- **MBTI**: 設定済みの場合、プロフィールページに表示（将来フェーズ）

### マッチングフィルタリング（将来フェーズ）

マッチングキュー参加時に `matching_preferences` の設定に基づいてフィルタリングする。

1. ユーザーがフィルタを設定（性別、年齢範囲）
2. マッチングキュー参加時にフィルタ条件をRedisに保存
3. マッチングロジックで相手のプロフィールとフィルタ条件を照合
4. 双方のフィルタ条件を満たすペアのみマッチング成立

### MBTI 連携（将来フェーズ）

- プロフィールに MBTI タイプを設定（16タイプから選択）
- マッチング時に相性スコアを計算・表示
- MBTI に基づいたトークテーマの最適化（会話アシスト）
- 相性の良い相手を優先的にマッチング

---

## 注意事項

### セキュリティ
- 生年月日は個人情報のため、API レスポンスには年齢のみ返却（他ユーザーのプロフィール取得時）
- 自分のプロフィール取得時のみ `birth_date` を返却
- 18歳未満チェックはサーバーサイドで厳密に実施

### バリデーション
- 生年月日: 18歳以上120歳以下
- 性別: MALE / FEMALE / OTHER のいずれか
- 表示名: 1〜30文字
- bio: 0〜500文字
- MBTI: 4文字（INTJ, ENFP 等の有効なタイプのみ、将来フェーズ）
