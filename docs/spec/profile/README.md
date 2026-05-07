# プロフィール機能 設計書

## 目次

- [概要](#概要)
- [Spec1 スコープ](#spec1-スコープ)
- [DB 設計](#db-設計)
  - [users テーブル拡張](#users-テーブル拡張)
  - [hobby_masters](#hobby_masters)
  - [user_hobbies](#user_hobbies)
  - [matching_preferences](#matching_preferences)
  - [Enum 定義](#enum-定義)
- [API 設計](#api-設計)
  - [プロフィール API](#プロフィール-api)
  - [マスターデータ API](#マスターデータ-api)
  - [マッチングフィルタ API](#マッチングフィルタ-api)
- [UI 設計](#ui-設計)
  - [プロフィール表示（/profile/:id）](#プロフィール表示profileid)
  - [プロフィール編集（/profile/edit）](#プロフィール編集profileedit)
  - [オンボーディング（/onboarding）](#オンボーディングonboarding)
  - [マッチングフィルタ設定（/matching/preferences）](#マッチングフィルタ設定matchingpreferences)
- [仕様詳細](#仕様詳細)
  - [年齢の計算](#年齢の計算)
  - [プロフィール公開範囲](#プロフィール公開範囲)
  - [マッチングフィルタリング](#マッチングフィルタリング)
  - [MBTI 連携](#mbti-連携)
  - [趣味マスター管理](#趣味マスター管理)
- [注意事項](#注意事項)
- [実装ロードマップ（Phase 3）](#実装ロードマップphase-3)

---

## 概要

ユーザーのプロフィール管理機能。基本情報（名前・bio・アバター）+ 生年月日・性別 + **MBTI / 居住地域 / 趣味** を管理する。年齢は生年月日から自動計算。マッチング時のフィルタリング（性別 / 年齢 / 居住地域 / MBTI / 趣味）に活用する。

---

## Spec1 スコープ

| 項目 | Spec1 | 将来フェーズ |
|------|-------|------------|
| 基本情報（名前・bio・アバター URL） | 実装 | アバター画像アップロード |
| 生年月日・年齢表示 | 実装 | - |
| 性別（MALE / FEMALE / OTHER） | 実装 | - |
| **MBTI（16 タイプ）** | 実装（プルダウン選択） | 診断テスト |
| **居住地域** | 実装（自由テキスト） | 都道府県マスター化 |
| **趣味（複数選択）** | 実装（マスター + 中間テーブル） | カテゴリ階層化 |
| プロフィール閲覧・編集 | 実装 | - |
| オンボーディング（必須 + 任意フィールド） | 実装 | - |
| **マッチングフィルタ（性別 / 年齢 / 居住地域 / MBTI / 趣味）** | 実装（DB + API + UI） | 実マッチングロジックは Phase 4 |
| 相性スコア表示 | - | Phase 8（MBTI・会話アシスト） |

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
| birth_date | date | nullable（is_onboarded=true なら必須） | 生年月日 | **追加** |
| gender | Gender | nullable（is_onboarded=true なら必須） | 性別（MALE / FEMALE / OTHER） | **追加** |
| is_onboarded | boolean | NOT NULL, default: false | 初期設定完了フラグ | 既存 |
| mbti | varchar(4) | nullable | MBTI タイプ（INTJ, ENFP 等） | **追加** |
| location | varchar(100) | nullable | 居住地域 | **追加** |
| coin_balance | int | NOT NULL, default: 0 | コイン残高（将来フェーズ） | **追加** |
| created_at | timestamp | NOT NULL | 作成日時 | 既存 |
| updated_at | timestamp | NOT NULL | 更新日時 | 既存 |

### hobby_masters

趣味のマスターデータ。Admin 画面で管理（将来）、初期はシードで投入（音楽鑑賞、映画、ゲーム等 20 件程度）。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | 趣味ID |
| name | varchar(50) | unique, NOT NULL | 趣味名 |
| sort_order | int | NOT NULL, default: 0 | 表示順 |
| is_active | boolean | NOT NULL, default: true | 有効フラグ |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

インデックス: `(is_active, sort_order)`

### user_hobbies

ユーザーと趣味の中間テーブル（多対多）。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, NOT NULL | ユーザー |
| hobby_id | int | FK → hobby_masters, NOT NULL | 趣味 |
| created_at | timestamp | NOT NULL | 作成日時 |

制約: `@@unique([user_id, hobby_id])`、インデックス: `user_id` / `hobby_id`

### matching_preferences

マッチング時のフィルタリング設定。ユーザーごとに 1 レコード（upsert で管理）。**複数選択を表現するため配列型**を採用。

| カラム | 型 | 制約 | 説明 |
|--------|------|------|------|
| id | int | PK, auto_increment | ID |
| user_id | int | FK → users, unique, NOT NULL | ユーザー |
| preferred_genders | Gender[] | NOT NULL, default: [] | 希望する相手の性別（空配列 = 制限なし） |
| age_min | int | nullable | 希望する最小年齢（null = 制限なし） |
| age_max | int | nullable | 希望する最大年齢（null = 制限なし） |
| preferred_locations | varchar(100)[] | NOT NULL, default: [] | 希望する相手の居住地域（空配列 = 制限なし） |
| preferred_mbti | varchar(4)[] | NOT NULL, default: [] | 希望する相手の MBTI 値（空配列 = 制限なし） |
| preferred_hobby_ids | int[] | NOT NULL, default: [] | 希望する相手の趣味（hobby_master.id、空配列 = 制限なし） |
| created_at | timestamp | NOT NULL | 作成日時 |
| updated_at | timestamp | NOT NULL | 更新日時 |

インデックス: `user_id`

**運用ルール**:
- 配列カラムは空配列 = 制限なし（NULL は使わない）
- レコードはユーザー作成時には作らず、フィルタ初設定時に upsert
- 配列サイズ上限: gender 3 / location 20 / mbti 16 / hobby 20

### Enum 定義

```typescript
enum Gender {
  MALE
  FEMALE
  OTHER
}
```

MBTI は 16 タイプの string enum（API 側 Zod で定義）:
`INTJ / INTP / ENTJ / ENTP / INFJ / INFP / ENFJ / ENFP / ISTJ / ISFJ / ESTJ / ESFJ / ISTP / ISFP / ESTP / ESFP`

---

## API 設計

### プロフィール API

| メソッド | パス | 認証 | Spec1 | 説明 |
|---------|------|------|-------|------|
| GET | `/api/users/:id` | Access Token | 実装 | プロフィール情報取得（年齢 / 趣味 / MBTI / 居住地域 / is_self による出し分け） |
| PUT | `/api/users/:id` | Access Token | 実装 | プロフィール更新（name / bio / avatar_url / birth_date / gender / mbti / location / hobby_ids） |
| PUT | `/api/users/:id/onboarding` | Access Token | 実装 | オンボーディング完了。必須: name / birth_date / gender、任意: bio / mbti / location / hobby_ids |

### マスターデータ API

| メソッド | パス | 認証 | Spec1 | 説明 |
|---------|------|------|-------|------|
| GET | `/api/hobbies` | Access Token | 実装 | 有効な趣味マスター一覧（sort_order 昇順） |

### マッチングフィルタ API

| メソッド | パス | 認証 | Spec1 | 説明 |
|---------|------|------|-------|------|
| GET | `/api/matching/preferences` | Access Token | 実装 | 自分のフィルタ設定。レコード未作成時はデフォルト値（全配列空 + age null）を 200 で返却 |
| PUT | `/api/matching/preferences` | Access Token | 実装 | フィルタ設定 upsert（preferred_genders / age_min / age_max / preferred_locations / preferred_mbti / preferred_hobby_ids） |

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
│  │                  XX 歳                          │ │
│  │                                                │ │
│  │  自己紹介テキスト                                │ │
│  │                                                │ │
│  │  1,234 フォロワー / 567 フォロー中               │ │
│  │  [プロフィール編集] [マッチングフィルタ] (自分) │ │
│  │  または [フォロー] (他人)                       │ │
│  └────────────────────────────────────────────────┘ │
│                                                     │
│  ┌─ MBTI / 居住地域 / 趣味（chip 表示） ─┐           │
│  │  MBTI       [INTJ]                    │           │
│  │  居住地域    東京都                     │           │
│  │  趣味        [音楽] [ゲーム] [映画]    │           │
│  └─────────────────────────────────────────┘         │
│                                                     │
│  [📺] ライブ配信履歴（Phase 6 まで空状態 UI）        │
│  [⚔️] バトル戦績（Phase 7 まで空状態 UI）          │
└─────────────────────────────────────────────────────┘
```

#### レイアウト

- **コンテナ**: `relative mx-auto max-w-2xl`
- **背景装飾**: 左上に 500px パープル blur オーブ
- **プロフィールヘッダー** (`ProfileHeaderCard`):
  - `glass-card overflow-hidden rounded-2xl`
  - **カバーグラデ**: `h-24`、`from-primary/20 via-cyan/10 to-accent-pink/20`
  - **アバター**: 80px 角丸、グラデ背景 + `ring-4 ring-dark-base` + パープルグロー、`-mt-14`
  - **アクション**:
    - 自分: 「プロフィール編集」(`/profile/edit`) + 「マッチングフィルタ」(`/matching/preferences`)
    - 他人: 「フォロー」（Phase 5 で活性化）
- **MBTI / 居住地域 / 趣味セクション** (`ProfileDetailSection`):
  - 各行: `<label>` + 値（Pill / テキスト / 「未設定」）
  - 趣味は chip（`rounded-full border-primary-border bg-primary-glow text-primary`）
  - 自分のプロフィール時は全値空でもセクション表示、他人時は全空なら非表示
- **配信履歴 / バトル戦績**: 空状態 UI（Phase 6 / Phase 7 で実 API 接続）

#### データ要件

- プロフィール本体: `GET /api/users/:id`
  - 共通: `id, name, avatar_url, bio, age, gender, mbti, location, hobbies`
  - 自分のみ: `birth_date, coin_balance, is_onboarded`
- 趣味マスター: `/profile/edit` でのみ取得
- 配信履歴: Phase 6 で `GET /api/streams?user_id=:id&past=true&limit=4`
- バトル戦績: Phase 7 で `GET /api/users/:id/battle-stats`

### プロフィール編集（/profile/edit）

```
┌─────────────────────────────────────────┐
│  プロフィール編集                         │
│                                         │
│  表示名 *      [____________]            │
│  自己紹介      [__________________]      │
│  生年月日 *    [1998/05/15]              │
│  性別 *        [男性] [女性] [その他]    │
│  ─ 任意項目 ─                            │
│  MBTI         [INTJ ▼]                  │
│  居住地域      [東京都]                   │
│  趣味          [□音楽 ☑ゲーム ☑映画 ...]│
│                                         │
│  [保存]  [キャンセル]                   │
└─────────────────────────────────────────┘
```

- Server Component で `GET /api/users/:id` + `GET /api/hobbies` を並行取得して初期値表示
- Server Action で `PUT /api/users/:id`
- 共通フォーム部品 (`apps/web/src/components/forms/`):
  - `GenderSelect`（3 ボタン）
  - `MbtiSelect`（プルダウン 16 タイプ + 「選択しない」）
  - `HobbyChips`（マスターから複数選択 chip 群）

### オンボーディング（/onboarding）

初回ログイン後（is_onboarded=false）に表示。**必須項目 + 任意項目を 1 画面で入力**。

```
┌─────────────────────────────────────────┐
│   はじめまして！                         │
│   プロフィールを設定しましょう            │
│                                         │
│   [Avatar Preview]                       │
│                                         │
│   表示名 *      [____________]            │
│   自己紹介      [__________________]      │
│   生年月日 *    [____/____/____]          │
│   性別 *        [男性] [女性] [その他]    │
│                                         │
│   ─ 任意項目（あとで設定可能） ─          │
│                                         │
│   MBTI         [選択しない ▼]            │
│   居住地域     [____________]            │
│   趣味         [□音楽 □ゲーム □映画 ...] │
│                                         │
│   [はじめる]                             │
└─────────────────────────────────────────┘
```

- 必須: name / birth_date / gender
- 任意: bio / mbti / location / hobby_ids
- Server Action で `PUT /api/users/:id/onboarding` → 完了で `/` リダイレクト

### マッチングフィルタ設定（/matching/preferences）

```
┌──────────────────────────────────────────────────┐
│   マッチングフィルタ設定                            │
│   このフィルタは Phase 4 のマッチング時に           │
│   相手の絞り込みに使用されます                      │
│                                                  │
│   性別          [☑ 男性] [☑ 女性] [□ その他]      │
│   年齢範囲      [25] 〜 [40] 歳                   │
│   居住地域      [+ Tokyo] [+ Osaka] [...入力欄]    │
│   MBTI          [☑ INTJ] [☑ ENTP] [...16タイプ]  │
│   趣味          [☑ 音楽] [☑ ゲーム] [□ 映画 ...] │
│                                                  │
│   [保存]  [キャンセル]                            │
└──────────────────────────────────────────────────┘
```

- すべて空 / null は「制限なし」
- Server Component で `GET /api/matching/preferences` + `GET /api/hobbies`
- Server Action で `PUT /api/matching/preferences` → `/profile/me` リダイレクト
- 部品: `GenderMultiSelect` / `AgeRangeInput` / `LocationsInput`（タグ追加方式） / `MbtiMultiSelect`（4×4 chip） / `HobbyChips`（共通）

---

## 仕様詳細

### 年齢の計算

- サーバーサイドで `birth_date` から年齢を計算してレスポンスに含める
- 計算ロジック: 日付比較（誕生日前なら -1）
- API レスポンスに `age: number | null`（DB カラムではない）
- 18 歳未満チェック: 更新 API（PUT / onboarding）の Service 層で実施

### プロフィール公開範囲

| フィールド | 自分（is_self=true） | 他人（is_self=false） |
|-----------|---------------------|----------------------|
| name / avatar_url / bio | 公開 | 公開 |
| age / gender | 公開 | 公開 |
| **mbti / location / hobbies** | 公開 | **公開**（マッチング相手の判断材料として必要） |
| **birth_date / coin_balance** | 公開 | **null マスク** |
| **is_self** | 常に true | 常に false |

`mbti / location / hobbies` を他人にも公開する理由: マッチング相手の絞り込み判断や相性表示に使うため。表示可否を UI 側で別途制御する場合はクライアント実装で対応。

### マッチングフィルタリング

マッチングキュー参加時に `matching_preferences` の設定に基づいて相手をフィルタリングする（Phase 4 で実装）。

1. ユーザーが `/matching/preferences` でフィルタ設定（gender / age / location / mbti / hobby）
2. マッチングキュー参加時にフィルタ条件を Redis に保存
3. マッチングロジックで相手のプロフィールとフィルタ条件を照合（双方の条件を満たすペアのみ成立）
4. 趣味の重複度を相性スコアに反映（Phase 8）

#### フィルタ判定ロジック（Phase 4）

各項目で以下のいずれかを満たすこと:

- `preferred_genders` が空、または相手の `gender` が含まれる
- `age_min` が null、または相手の `age >= age_min`
- `age_max` が null、または相手の `age <= age_max`
- `preferred_locations` が空、または相手の `location` が含まれる
- `preferred_mbti` が空、または相手の `mbti` が含まれる
- `preferred_hobby_ids` が空、または相手の `hobbies` のいずれかと一致

### MBTI 連携

- プロフィールに MBTI タイプを設定（16 タイプから選択）
- マッチング時に相手の MBTI 表示
- マッチング後に相性スコアを計算・表示（Phase 8）
- MBTI 診断テスト機能（将来）

### 趣味マスター管理

- `hobby_masters` テーブルで管理（Admin で増減可能、Spec1 ではシードで投入）
- 表記ゆれを防ぐためマスターから選択方式（自由入力不可）
- 並び順は `sort_order` 昇順
- 無効化: `is_active=false`（既存ユーザーの user_hobbies は残るが、新規選択不可）

---

## 注意事項

### セキュリティ
- 生年月日は個人情報。年齢のみ公開、`birth_date` は自分のみ
- 18 歳未満チェックはサーバーサイドで厳密に実施
- 趣味 / MBTI / 居住地域は個人情報だが、マッチング用途で他人にも公開（仕様）

### バリデーション
- 生年月日: 18 歳以上 120 歳以下
- 性別: MALE / FEMALE / OTHER のいずれか
- 表示名: 1〜30 文字
- bio: 0〜500 文字
- MBTI: 16 タイプの enum 値のみ
- 居住地域: 0〜100 文字（自由入力）
- 趣味: hobby_masters に存在する有効 id のみ、最大 20 件
- マッチングフィルタ:
  - age_min / age_max は 18〜120、`age_min <= age_max`
  - 配列サイズ上限: gender 3 / location 20 / mbti 16 / hobby 20

### パフォーマンス
- 趣味マスターは件数が少ないので 1 リクエストで全件取得（ページネーション不要）
- 将来的に `Cache-Control: public, max-age=300` を `/api/hobbies` に付与
- `MatchingPreference` は Phase 4 のマッチングキュー処理で頻繁に読まれるが、ユーザーごとに 1 行なので index で十分

---

## 実装ロードマップ（Phase 3）

Phase 3 は本ファイルの設計を依存関係順に **10 step** に分割して実装する。各 step はテスト可能な最小単位として独立して PR を切る（Phase 1 / Phase 2 と同じ流儀）。

実装順は **DB → API → Web** の依存関係に従う。step3 / step4 は step2 / step5 で作る共通スキーマ・Service ヘルパーを利用するため step2 / step5 の後に進める。Web 系（step7〜10）は対応する API がマージされた後に実装する。

| step | 種別 | 内容 | 依存 | リンク |
|------|------|------|------|------|
| step1 | DB | Prisma スキーマ拡張（users / Gender enum / hobby_masters / user_hobbies / matching_preferences）+ マイグレーション + 趣味マスターのシード | - | [step1-db-profile.md](./step1-db-profile.md) |
| step2 | API | `GET /api/users/:id`。年齢計算 + 趣味込みプロフィール + is_self 出し分け | step1 | [step2-api-get-user.md](./step2-api-get-user.md) |
| step3 | API | `PUT /api/users/:id`。趣味 / MBTI / 居住地域も更新、18 歳バリデーション、hobby_id 妥当性検証 | step1, step2 | [step3-api-put-user.md](./step3-api-put-user.md) |
| step4 | API | `PUT /api/users/:id/onboarding`。必須 + 任意フィールド一括登録 | step1, step2, step3 | [step4-api-onboarding.md](./step4-api-onboarding.md) |
| step5 | API | `GET /api/hobbies` 趣味マスター一覧 | step1 | [step5-api-hobbies.md](./step5-api-hobbies.md) |
| step6 | API | `GET/PUT /api/matching/preferences` フィルタ設定の取得・upsert | step1, step5 | [step6-api-matching-preferences.md](./step6-api-matching-preferences.md) |
| step7 | Web | `/onboarding` ページ。任意項目「あとで設定」スキップ可 | step4, step5 | [step7-web-onboarding.md](./step7-web-onboarding.md) |
| step8 | Web | `/profile/[id]` 表示 + `/profile/me` リダイレクト | step2 | [step8-web-profile-view.md](./step8-web-profile-view.md) |
| step9 | Web | `/profile/edit` 編集ページ + フォーム部品共通化 | step3, step5, step8 | [step9-web-profile-edit.md](./step9-web-profile-edit.md) |
| step10 | Web | `/matching/preferences` フィルタ設定ページ | step6, step5, step9 | [step10-web-matching-preferences.md](./step10-web-matching-preferences.md) |

### 全 step 共通の方針

- API のコード例は `apps/api/CLAUDE.md` のレイヤードアーキテクチャ・Result 型・テスト戦略に厳密準拠
- スキーマは `packages/schema` の `@repo/api-schema` に定義し、API/Web 両方が import する
- Web のコード例は `apps/web/CLAUDE.md` の API 通信ルール（GET は Server Component / RouteHandler、Mutation は Server Action）に従う
- Service ユニットテスト（`jest.fn()` モック）+ Controller インテグレーションテスト（実 DB / supertest）を必ず書く
- 18 歳以上 / 120 歳以下の境界値テストを step3 / step4 で必ず含める
- 18 歳未満チェックはサーバーサイドで厳密に実施。Web 側のフォーム制約はあくまで補助
- `setup.ts` の `cleanupTestData` に新テーブル（hobby_masters / user_hobbies / matching_preferences）を追加すること
- Lint（`cd apps/{api,web} && pnpm lint`）が通ること
