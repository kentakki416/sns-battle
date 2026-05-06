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

- [ ] DB: `users` に `bio`、`is_onboarded` 追加
- [ ] API: `POST /api/auth/google`、`POST /api/auth/refresh`、`POST /api/auth/logout`、`GET /api/auth/me`
- [ ] Next.js: Google OAuth コールバック Route Handler + Cookie ベースのセッション管理
- [ ] Frontend: `/sign-in` ページ（フローティングオーブ背景、左ブランド + 右カード）
- [ ] Frontend: 認証ミドルウェア（未ログイン時は `/sign-in` へリダイレクト）

---

## Phase 2: 共通 UI 基盤（common）

ほぼすべての機能で使うレイアウトとコンポーネント。

- [ ] `globals.css` のデザイントークンが適用されていることを確認（既存）
- [ ] `<AppShell>`: パスごとに immersive / no-sidebar / default を切替
- [ ] `<Navbar>`: ロゴ、検索バー、マッチング開始 CTA、通知、アバター
- [ ] `<Sidebar>`: ナビ + フォロー中ユーザー + 折りたたみ + プロフィールカード
- [ ] `<LiveBadge>`: LIVE 表示用バッジ
- [ ] `<VideoChatOverlay>`: コメント + スタンプパレット + 入力欄
- [ ] `<CountdownOverlay>`: 3-2-1-START の全画面オーバーレイ
- [ ] `<TimerBar>`: 上部固定の進行度バー（色分け付き）
- [ ] `<ConfettiEffect>`: `canvas-confetti` ラッパー

---

## Phase 3: プロフィール（profile）

認証直後のオンボーディング + 自他のプロフィール表示。

- [ ] DB: `users` に `birth_date`、`gender`、`mbti`、`location`、`coin_balance` 追加 / `matching_preferences` テーブル作成
- [ ] API: `GET /api/users/:id`、`PUT /api/users/:id`、`PUT /api/users/:id/onboarding`
- [ ] Frontend: `/onboarding` ページ（生年月日 + 性別 必須）
- [ ] Frontend: `/profile/:id` 表示ページ（カバー、ヘッダー、配信履歴、バトル戦績）
- [ ] Frontend: `/profile/edit` 編集ページ
- [ ] バリデーション: 18 歳以上チェックをサーバー側で実施

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

将来フェーズ。

- [ ] DB: `effects`、`user_inventory`、`coin_transactions` テーブル作成
- [ ] API: コイン購入（IAP / Stripe）、スタンプ・エフェクト購入、所持品取得
- [ ] Frontend: `/shop` 画面（カテゴリ別スタンプ・エフェクト購入）
- [ ] Frontend: コイン残高表示、購入確認モーダル
- [ ] スタンプアニメーション種別（FLOAT / BOUNCE / EXPLODE / SHAKE）の実装

---

## メモ

- **依存関係**: Phase 0 → 1 → 2 が前提。Phase 3〜7 は Phase 1+2 が完了していれば並列実装可能だが、Phase 4（マッチング）が Spec1 のメインなので優先する
- **LiveKit が絡む機能**: Phase 4（マッチング）、Phase 6（配信）、Phase 7（バトル）。先にマッチングで LiveKit 連携の基本パターンを確立すると後続が楽
- **Redis が絡む機能**: マッチングキュー、バトルスタンプカウント、テーマタイマー
- **テスト方針**: Service 層はユニットテスト（`jest.fn()` モック）、Controller 層は実 DB を使ったインテグレーションテスト
