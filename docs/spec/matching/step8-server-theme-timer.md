# step8-server-theme-timer.md

サーバーサイドのテーマ進行タイマーサービスを実装する。セッション開始時にテーマ進行を起動し、テーマごとの `duration` 経過で次のテーマを Data Channel `matching:theme` で配信。テーマ切替時に `matching:hype` を配信。30 秒間隔で `matching:timer` を配信。10 分経過で TIMEOUT 終了処理（step5 の `endMatchingSession(reason="TIMEOUT")` を呼ぶ）。

設計詳細は `docs/spec/matching/README.md` の [サーバーサイドタイマー管理](./README.md#サーバーサイドタイマー管理) を参照。依存: step1（DB）、step5（セッション API）、step4（LiveKit クライアント）。

## 仕様

- セッション開始時（step2 の `joinMatching` 成立時 or `/sessions/:id/start` 想定）にタイマーサービスを起動
- Redis キー:
  - `matching:timer:{sessionId}` — `startedAt` 保持（EXPIRE 600）
  - `matching:theme:{sessionId}` — `{ currentRound, themeId, speakerUserId, startedAt }`
  - `matching:themes:{sessionId}` — 該当セッション用にシャッフル済みのテーマ ID 配列（合計 10 ラウンド分）
- Data Channel `matching:theme` payload: `{ round_number, theme_id, type, title, choices?, speaker, duration }`
- Data Channel `matching:hype` payload: `{ message: "本当に相手の心つかめたか？" }`（HYPE_COMMENTS 配列からランダム）
- Data Channel `matching:timer` payload: `{ remaining_seconds, can_end_now: boolean }`（30 秒間隔）
- 10 分経過 → `endMatchingSession(reason="TIMEOUT")` + Data Channel `matching:ended` 配信

## 対応内容

### テーマシャッフルロジック

`apps/api/src/service/matching-theme-service.ts`（新規）。10 ラウンド分のテーマを talk_themes（category=MATCHING）からランダムに選択し、CHOICE と FREE_TALK を交互に配置する。同一テーマ重複は避ける（10 件未満なら重複可）。

```typescript
export const buildThemeSchedule = async (
  repo: { talkThemeRepository: TalkThemeRepository }
): Promise<{ themeId: number; speakerUserKey: "user1" | "user2"; durationSeconds: number }[]> => {
  // talk_themes から MATCHING カテゴリの全テーマを取得
  // CHOICE / FREE_TALK で分けてシャッフル
  // 交互に並べて 10 件にする
  // speaker は user1 → user2 → user1 → ... と交互
  // duration は theme.duration を使用
}
```

### スケジューラ起動・進行

`apps/api/src/service/matching-scheduler-service.ts`（新規）。Node.js の `setTimeout` を使った単純なスケジューラ。サーバー再起動時は Redis から復元する。

```typescript
export interface MatchingScheduler {
  /** セッション開始時に起動。既に動いている場合は無視 */
  start(sessionId: number): Promise<void>
  /** 終了時に解除（TIMEOUT / USER_LEFT / MANUAL いずれの理由でも呼ぶ） */
  stop(sessionId: number): Promise<void>
}
```

実装方針:

1. `start(sessionId)`:
   - Redis に schedule を作って永続化（`matching:themes:{sessionId}`、`matching:theme:{sessionId}`）
   - `startedAt` を保存
   - `MatchingSession.status` を `ACTIVE` に更新（COUNTDOWN → ACTIVE）
   - 第 1 ラウンドの `matching:theme` を即配信
   - その後、`setTimeout` チェーンで次のラウンドへ
   - 並行して `setInterval` で 30 秒ごとに `matching:timer` 配信
   - 全 10 ラウンド完了 or 10 分経過で `stop` + `endMatchingSession(TIMEOUT)`
2. `stop(sessionId)`:
   - 対応する `setTimeout` / `setInterval` を clear
   - Redis のスケジュールキーを削除

サーバー再起動時の復元: アプリ起動時に `matching:theme:{sessionId}` がある全セッションを列挙し、現在時刻と `startedAt` を比較して残り時間を計算 → 適切なラウンドから `start` し直す。簡易実装として「ACTIVE な全 MatchingSession を列挙して再 start」でもよい（多重起動防止のため Redis の単純な lock キー `matching:scheduler:{sessionId}` を SET NX EX 10 で都度更新）。

### Data Channel 配信

step4 / step6 で作った `livekitClient.publishData` を再利用。

```typescript
await livekitClient.publishData({
  roomName: `matching:${sessionId}`,
  topic: "matching:theme",
  payload: { round_number, theme_id, type, title, choices, speaker, duration },
})
```

choices は `talk_theme_choices` を JOIN して取得。`speaker` は `"user1"` / `"user2"` の文字列で送信、フロントは `getMatchingSession` で取得した `is_self_user1` と照合してスポットライトを判定する。

### HYPE_COMMENTS 定数

```typescript
const HYPE_COMMENTS = [
  "本当に相手の心つかめたか？",
  "いい感じ！",
  "盛り上がってきた！",
  "次のテーマで勝負！",
  "相性バッチリかも！？",
  "ドキドキの展開！",
  "ここからが本番！",
  "運命の出会いか！？",
] as const
```

### join 時の起動

step2 の `joinMatching` のマッチング成立処理の最後（COUNTDOWN セッション作成後）に `scheduler.start(sessionId)` を呼ぶ。

ただし COUNTDOWN は 4 秒（クライアント側で 3-2-1-START）あるため、サーバー側もそれに合わせて以下のいずれか:

- A) join 成立直後に起動するが、最初の `setTimeout` で 4 秒待ってから第 1 ラウンドを配信
- B) クライアントが COUNTDOWN を終えたら `POST /api/matching/sessions/:id/start` を呼んで起動

A は実装が単純、B は明示的でテストしやすい。**B を推奨**。step2 では COUNTDOWN セッションを作成、step8 で `/sessions/:id/start` 受信時にスケジューラ起動する 2 段構成。

### `POST /api/matching/sessions/:id/start` の追加

- 認証: 参加者のみ
- セッションが COUNTDOWN ステータスでなければ 400
- 一方のユーザーが先に呼ぶケースに備えて idempotent にする（既に ACTIVE なら何もしない）

## 動作確認

### Service ユニットテスト

`buildThemeSchedule` のロジックは単体でテスト可能:

- 10 件以上のテーマがあれば全て異なる theme_id
- 交互に CHOICE / FREE_TALK が並ぶ
- speaker が user1 / user2 / user1 / ... の順
- 10 件未満のときは重複を許容

`MatchingScheduler` 自体は副作用が大きいので統合テストでカバー。

### Integration テスト

`apps/api/test/server/matching-scheduler.test.ts`（新規）。

- 実 DB + 実 Redis + mock LiveKitClient
- `start(sessionId)` 後、jest fake timers で時間を進める
- 第 1 ラウンドの `matching:theme` が publishData に渡されること
- duration 経過で第 2 ラウンドが配信されること（`matching:hype` も配信）
- 10 分経過で `endMatchingSession(TIMEOUT)` が呼ばれ、`matching:ended` が配信されること
- `stop` で setTimeout / setInterval が clear されること

### dev で疎通

```bash
# 1. 2 ユーザーで join → セッション成立
# 2. POST /sessions/:id/start
# 3. LiveKit Cloud のダッシュボードで Room 内 Data Channel メッセージを確認
#    （または step11 のフロントで Data Channel を listen して console.log）
```

## 既知の未対応 / 後続 step に持ち越し

- サーバー再起動時の Redis 復元処理は本 step では「アプリ起動時に ACTIVE セッション全件を再 start」で簡易実装。本格的な分散実行（複数 API インスタンス）対応は将来検討
- マッチング中の participant_left を契機に scheduler を即停止するのは step9（Webhook）
- 「テーマが 10 件未満」のフォールバックは talk_themes seed で 10 件以上を保証するため通常は発生しない
