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

- [x] DB: `items`、`item_scopes`、`stamp_details`、`effect_details`、`boost_details`、`user_inventory`、`coin_transactions` を新設
- [x] DB: `stamp_masters` テーブルと `StampCategory` enum を削除
- [x] DB: `User` モデルに `inventories` / `coinTransactions` リレーション追加
- [x] enum: `ItemType` / `Scope` / `EffectType` / `BoostType` / `TransactionType` を追加
- [x] migration: `migrate_stamp_to_items` を発行（drop → create のクリーン構成）
- [x] seed: 既存スタンプを `items` + `stamp_details` + `item_scopes` で再投入。`GENERAL` は MATCHING / BATTLE / STREAMING の3 scope に展開
- [x] `pnpm prisma generate` と `pnpm test` がグリーン

---

## Phase 4: マッチング（matching）

Spec1 のメイン機能。実装手順は `docs/spec/matching/README.md` の「実装ステップ」と各 `step{n}-*.md` を参照。

- [x] DB: `matching_queue`、`matching_sessions`、`matching_reactions` テーブル作成（step1）
- [x] API: `POST /api/matching/join`、`DELETE /api/matching/leave`、`GET /api/matching/status`（step2）
- [x] API: SSE `GET /api/matching/events`（matched / heartbeat / cancelled）（step3）
- [x] API: `POST /api/matching/token`（LiveKit トークン発行）（step4）
- [x] API: `GET /api/matching/sessions/:id`、`POST /api/matching/sessions/:id/end`（step5）
- [x] API: `POST /api/matching/sessions/:id/reaction`、`GET /api/matching/sessions/:id/reactions`（step6）
- [x] API: `POST /api/matching/sessions/:id/stamp`（step7）
- [x] API: `POST /api/matching/sessions/:id/start`（COUNTDOWN→ACTIVE + theme-progress ジョブ enqueue）（step8a）
- [x] Server: マッチングキューサービス（Redis Sorted Set + Pub/Sub）（step2/3）
- [x] Server: テーマ進行タイマー（`advance-theme` / `publish-timer` / `session-timeout` を BullMQ delayed job で実装。`apps/matching-worker`）（step8b）
- [x] Webhook: API 側 `POST /api/matching/livekit-webhook` で signature 検証 + BullMQ enqueue（step9a）
- [x] Webhook: matching-worker 側で `livekit-event` ジョブを消化し `participant_left` / `room_finished` でセッション終了処理（step9b）
- [x] Frontend: `/matching` ロビー（待機ユーザー一覧 + マッチング開始 CTA）（step10）
- [x] Frontend: `/matching/session` セッション（waiting → matched → countdown → active の状態遷移）（step11）
- [x] Frontend: `/matching/result` 結果ページ（step12）
- [x] Frontend: テーマカード、スポットライト、リアクションバブル、フリートーク希望ボタン、盛り上げコメント（step11 持ち越し / PR #64）
- [x] Web 側 SSE 購読（`/api/matching/events`）で待機中に matched イベントを非同期受信する経路（step11 持ち越し / PR #63）
- [x] `/matching/result?session_id=N` の存在しないセッション時のエラーハンドリング（step12 持ち越し / PR #63）
- [x] Active 中の `matching:reaction_match` 受信時の紙吹雪 / 一致演出（PR #67）
- [x] Active 中のスタンプ送信 UI（PR #68 想定: GET /api/matching/stamps + StampPalette 統合）
- [x] カメラ/マイク permission 拒否時のフォールバック UI（PR #67）

---

## Phase 5: ソーシャル（social）

ホーム・検索・カード群。マッチング後のフォロー操作で使う。

- [x] API: `POST/DELETE /api/users/:id/follow`（PR #66）
- [x] API: `POST/DELETE /api/users/:id/block`（ブロック発行時に既存 follow を双方向削除）
- [x] API: `GET /api/users/:id/followers`、`GET /api/users/:id/following`（cursor ページネーション、`limit` 1..100 / 既定 20）
- [x] API: `GET /api/users/search`（双方向ブロック除外、cursor ページネーション、name 部分一致 / case-insensitive）
- [ ] API: `GET /api/streams/search`（Phase 8 で `streams` テーブル新設後）
- [ ] API: `GET /api/battles/search`（Phase 9 で `battle_rooms` テーブル新設後）
- [ ] Frontend: `<StreamCard>`、`<BattleCard>`、`<UserCard>` 共通コンポーネント
- [ ] Frontend: `/`（ホームフィード、4 セクション）
- [ ] Frontend: `/search`（タブ + 検索バー）
- [ ] Frontend: ナビバー検索 → `/search?q=` 遷移
- [ ] サイドバーのフォロー中ユーザー一覧をリアルタイムデータで表示

---

## Phase 6: MBTI・会話アシスト（Spec2）

将来フェーズ。

- [ ] DB: `users.mbti` の利用開始
- [ ] Frontend: プロフィール編集に MBTI セレクタ追加
- [ ] API: マッチング時に MBTI 相性スコアを返却
- [ ] Frontend: マッチング成立画面に相性スコア表示
- [ ] Server: トークテーマを MBTI 相性に応じて最適化

---

## Phase 7: 課金・ショップ（Spec6）

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

## Phase 8: ライブ配信（streaming）

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

## Phase 9: バトル（battle）

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
