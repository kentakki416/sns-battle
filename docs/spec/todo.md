# 実装 TODO

機能ごとの大まかな実装手順。各機能の詳細は `docs/spec/{feature}/README.md` を参照。

依存関係を考慮して、上から順に実装するのを推奨する。

---

## Phase 0: 基盤整備

すべての機能の前提となる土台。

- [x] Prisma スキーマ（`users` 拡張、`auth_accounts`、`follows`、`blocks`、`stamp_masters`、`talk_themes`、`talk_theme_choices`）
- [x] 初回マイグレーション + シードスクリプト（最低限のマスターデータ）
- [x] `packages/schema` の `api-schema/` に共通レスポンス型・エラーレスポンス型を定義
- [x] API サーバー: グローバルエラーハンドラ、認証ミドルウェアのスケルトン
---

## Phase 1: 認証（auth）

すべての画面の入口。

- [x] DB: `users` に `bio`、`is_onboarded` 追加
- [x] API: `POST /api/auth/google`、`POST /api/auth/refresh`、`POST /api/auth/logout`、`GET /api/auth/me`
- [x] Next.js: Google OAuth コールバック Route Handler + Cookie ベースのセッション管理
- [x] Frontend: `/sign-in` ページ（フローティングオーブ背景、左ブランド + 右カード）
- [x] Frontend: 認証ミドルウェア（未ログイン時は `/sign-in` へリダイレクト）

---

## Phase 2: 共通 UI 基盤（common）

ほぼすべての機能で使うレイアウトとコンポーネント。

- [x] `globals.css` のデザイントークンが適用されていることを確認（既存）
- [x] `<AppShell>`: パスごとに immersive / no-sidebar / default を切替
- [x] `<Navbar>`: ロゴ、検索バー、マッチング開始 CTA、通知、アバター
- [x] `<Sidebar>`: ナビ + フォロー中ユーザー + 折りたたみ + プロフィールカード
- [x] `<LiveBadge>`: LIVE 表示用バッジ
- [x] `<VideoChatOverlay>`: コメント + スタンプパレット + 入力欄
- [x] `<CountdownOverlay>`: 3-2-1-START の全画面オーバーレイ
- [x] `<TimerBar>`: 上部固定の進行度バー（色分け付き）
- [x] `<ConfettiEffect>`: `canvas-confetti` ラッパー

---

## Phase 3: プロフィール（profile）

認証直後のオンボーディング + 自他のプロフィール表示。

- [x] DB: `users` に `birth_date`、`gender`、`mbti`、`location`、`coin_balance` 追加 / `hobby_masters` / `user_hobbies` / `matching_preferences` テーブル作成
- [x] API: `GET /api/users/:id`、`PUT /api/users/:id`、`PUT /api/users/:id/onboarding`
- [x] API: `GET /api/hobbies`（趣味マスター一覧）
- [x] API: `GET /api/matching/preferences`、`PUT /api/matching/preferences`
- [x] Frontend: `/onboarding` ページ（生年月日 + 性別 必須）
- [x] Frontend: `/profile/:id` 表示ページ（カバー、ヘッダー、配信履歴、バトル戦績）
- [x] Frontend: `/profile/edit` 編集ページ
- [x] Frontend: `/matching/preferences`（マッチングフィルタ設定 UI）
- [x] バリデーション: 18 歳以上チェックをサーバー側で実施

---

## Phase 3.5: アイテム DB 統合（Spec1 リリース前の前提）

`stamp_masters` を `items` 親テーブル + 種別ごとの詳細テーブルに統合する。Phase 4 マッチングのスタンプ送信 API（`POST /api/matching/sessions/:id/stamp`）が `items` を参照するため、**Phase 4 着手前に必ず完了**させる。

設計詳細は [common/README.md - アイテム・課金系テーブル設計方針](./common/README.md#アイテム課金系テーブル設計方針) と [common/step9-db-migrate-stamp-to-items.md](./common/step9-db-migrate-stamp-to-items.md) を参照。

- [ ] DB: `items`、`item_scopes`、`stamp_details`、`effect_details`、`boost_details`、`user_inventory`、`coin_transactions` を新設
- [ ] DB: `stamp_masters` テーブルと `StampCategory` enum を削除
- [ ] DB: `User` モデルに `inventories` / `coinTransactions` リレーション追加
- [ ] enum: `ItemType` / `Scope` / `EffectType` / `BoostType` / `TransactionType` を追加
- [ ] migration: `migrate_stamp_to_items` を発行（drop → create のクリーン構成）
- [ ] seed: 既存スタンプを `items` + `stamp_details` + `item_scopes` で再投入。`GENERAL` は MATCHING / BATTLE / STREAMING の3 scope に展開
- [ ] `pnpm prisma generate` と `pnpm test` がグリーン

---

## Phase 4: マッチング（matching）

Spec1 のメイン機能。

- [ ] DB: `matching_queue`、`matching_sessions`、`matching_reactions` テーブル作成
- [ ] API: `POST /api/matching/join`、`DELETE /api/matching/leave`、`GET /api/matching/status`
- [ ] API: SSE `GET /api/matching/events`（matched / heartbeat / cancelled）
- [ ] API: `POST /api/matching/token`（LiveKit トークン発行）
- [ ] API: `GET /api/matching/sessions/:id`、`POST /api/matching/sessions/:id/end`
- [ ] API: `POST /api/matching/sessions/:id/reaction`、`GET /api/matching/sessions/:id/reactions`
- [ ] Server: マッチングキューサービス（Redis Sorted Set + Pub/Sub）
- [ ] Server: テーマ進行タイマー（Data Channel `matching:theme` / `matching:hype` / `matching:timer`）
- [ ] Frontend: `/matching` ロビー（待機ユーザー一覧 + マッチング開始 CTA）
- [ ] Frontend: `/matching/session` セッション（waiting → matched → countdown → active の状態遷移）
- [ ] Frontend: テーマカード、スポットライト、リアクションバブル、フリートーク希望ボタン、盛り上げコメント
- [ ] Frontend: `/matching/result` 結果ページ
- [ ] Webhook: LiveKit `participant_left` / `room_finished` でセッション終了処理

---

## Phase 5: ソーシャル（social）

ホーム・検索・カード群。マッチング後のフォロー操作で使う。

- [ ] API: `POST/DELETE /api/users/:id/follow`、`POST/DELETE /api/users/:id/block`
- [ ] API: `GET /api/users/:id/followers`、`GET /api/users/:id/following`
- [ ] API: `GET /api/streams/search`、`GET /api/users/search`、`GET /api/battles/search`
- [ ] Frontend: `<StreamCard>`、`<BattleCard>`、`<UserCard>` 共通コンポーネント
- [ ] Frontend: `/`（ホームフィード、4 セクション）
- [ ] Frontend: `/search`（タブ + 検索バー）
- [ ] Frontend: ナビバー検索 → `/search?q=` 遷移
- [ ] サイドバーのフォロー中ユーザー一覧をリアルタイムデータで表示

---

## Phase 6: ライブ配信（streaming）

Spec3。

- [ ] DB: `streams`、`stream_comments`、`stream_stamps` テーブル作成
- [ ] API: `GET /api/streams`、`GET /api/streams/:id`、`PUT /api/streams/:id`
- [ ] API: `POST /api/streams/token`、`POST /api/streams/ingress`
- [ ] LiveKit: Ingress 作成（WHIP）、Webhook `ingress_started/ended` で `is_live` 同期
- [ ] Frontend: `/dashboard/stream` 配信者ダッシュボード（タイトル、設定）
- [ ] Frontend: `/dashboard/stream/start` 配信開始（カメラ許可 → カウントダウン → 配信中）
- [ ] Frontend: `/stream/:username` 視聴ページ（フルスクリーンビデオ + チャットオーバーレイ）
- [ ] Frontend: `<StampFloatLayer>` 受信スタンプフロート

---

## Phase 7: バトル（battle）

Spec4。

- [ ] DB: `battle_rooms`、`battle_stamps`、`battle_comments` テーブル作成
- [ ] API: `GET /api/battles`、`POST /api/battles`、`GET /api/battles/:id`
- [ ] API: `POST /api/battles/:id/join`、`/watch`、`/start`、`/end`
- [ ] API: `GET /api/battles/:id/result`、`GET /api/battles/:id/comments`
- [ ] Server: ターン制タイマーサービス（1 分ごとに `battle:turn` 配信）
- [ ] Server: スタンプカウントサービス（Redis HINCRBY + 1 秒間隔ブロードキャスト）
- [ ] Frontend: `/battles` 一覧（タブ）
- [ ] Frontend: `/battles/create` 作成フォーム
- [ ] Frontend: `/battles/:id` バトルルーム（VS レイアウト + スタンプカウント + チャット）
- [ ] Frontend: `/battles/:id/result` 結果（勝者冠 + 紙吹雪）

---

## Phase 8: MBTI・会話アシスト（Spec2）

将来フェーズ。

- [ ] DB: `users.mbti` の利用開始
- [ ] Frontend: プロフィール編集に MBTI セレクタ追加
- [ ] API: マッチング時に MBTI 相性スコアを返却
- [ ] Frontend: マッチング成立画面に相性スコア表示
- [ ] Server: トークテーマを MBTI 相性に応じて最適化

---

## Phase 9: 課金・ショップ（Spec6）

将来フェーズ。アイテム DB のテーブル本体は **Phase 3.5 で先行作成済み** のため、本フェーズでは API・ビジネスロジック・UI を実装する。

- [ ] API: `GET /api/items`、`GET /api/items/:id`、`POST /api/items/:id/purchase`
- [ ] API: `GET /api/me/inventory`、`GET /api/me/coin-balance`、`GET /api/me/coin-transactions`
- [ ] API: `POST /api/coins/purchase`（IAP / Stripe レシート検証）
- [ ] API: マッチング・バトル・配信のスタンプ送信時に `user_inventory` を所持確認するガード追加
- [ ] seed: `EFFECT` / `BOOST` 系アイテムのシード追加
- [ ] Frontend: `/shop` 画面（type タブ + scope フィルタ）
- [ ] Frontend: コイン残高表示、購入確認モーダル、所持品ページ
- [ ] スタンプアニメーション種別（FLOAT / BOUNCE / EXPLODE / SHAKE）の実装
- [ ] BOOST 系アイテム（マッチング優先券等）のサーバー側消費ロジック

---

## メモ

- **依存関係**: Phase 0 → 1 → 2 が前提。Phase 3 と Phase 3.5 は並列可能だが、**Phase 4 着手前に Phase 3.5 が完了していること**が必須（マッチングのスタンプ送信 API が `items` を参照するため）。Phase 5〜7 は Phase 1+2+3.5 完了後に並列実装可能
- **Spec1 リリース範囲**: Phase 0 / 1 / 2 / 3 / 3.5 / 4 が完了した時点
- **LiveKit が絡む機能**: Phase 4（マッチング）、Phase 6（配信）、Phase 7（バトル）。先にマッチングで LiveKit 連携の基本パターンを確立すると後続が楽
- **Redis が絡む機能**: マッチングキュー、バトルスタンプカウント、テーマタイマー
- **テスト方針**: Service 層はユニットテスト（`jest.fn()` モック）、Controller 層は実 DB を使ったインテグレーションテスト
