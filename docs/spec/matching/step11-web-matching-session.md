# step11-web-matching-session.md

`/matching/session` セッションページを実装する。1 ページ内で 4 状態（`waiting → matched → countdown → active`）を遷移する。LiveKit クライアントで Room 接続、Data Channel イベント（`matching:theme` / `matching:hype` / `matching:reaction_match` / `matching:stamp` / `matching:timer` / `matching:ended`）をハンドリング。

UI 仕様は `docs/spec/matching/README.md` の [マッチングセッション](./README.md#マッチングセッションmatchingsession) を参照。AppShell の **immersive モード**（フルスクリーン）。

依存: step1〜9（API + サーバーロジック）、Phase 2 step5〜8（VideoChatOverlay / CountdownOverlay / TimerBar / ConfettiEffect）、Phase 3（プロフィール）。

## 仕様

- 認証必須。is_onboarded=false → /onboarding リダイレクト
- ページ遷移時の処理:
  1. SSE `/api/matching/events` を購読
  2. `POST /api/matching/join` を発火
  3. レスポンス or SSE で `matched` 受信 → state を `matched` に
  4. 2 秒後に `countdown` へ
  5. countdown 完了で `active`、`POST /api/matching/sessions/:id/start` を発火（step8 のサーバーサイドタイマー起動）+ `POST /api/matching/token` で LiveKit token 取得 → Room 接続
- `active` 中は LiveKit Data Channel イベントで UI 更新
- `matching:ended` 受信 or 5 分経過後の終了ボタンクリックで `/matching/result?session_id={id}` へ遷移
- ページから離脱 / リロード時は `DELETE /api/matching/leave`（waiting 中のみ）

## 対応内容

### LiveKit クライアントライブラリ導入

```bash
cd apps/web && pnpm add livekit-client
```

### ファイル構成

```
apps/web/src/app/matching/session/
├── page.tsx                       ← Server Component（is_onboarded チェックのみ）
├── _components/
│   ├── MatchingSession.tsx        ← Client メインコンポーネント（状態マシン）
│   ├── states/
│   │   ├── WaitingState.tsx       ← 三重パルス円 + キャンセル
│   │   ├── MatchedState.tsx       ← 成立画面（2秒）
│   │   ├── CountdownState.tsx     ← <CountdownOverlay> ラッパ（既存）
│   │   └── ActiveState.tsx        ← ビデオ通話メイン UI
│   ├── active/
│   │   ├── VideoPanel.tsx         ← 自分/相手のビデオパネル + スポットライト
│   │   ├── ThemeCard.tsx          ← シャボン玉風テーマカード
│   │   ├── ReactionBubbleLayer.tsx
│   │   ├── HypeCommentOverlay.tsx
│   │   ├── ThemeTimerBar.tsx      ← <TimerBar> 拡張
│   │   ├── StampPalette.tsx       ← 既存（Phase 2 step5）を再利用
│   │   ├── StampFloatLayer.tsx    ← 受信スタンプ表示
│   │   └── BottomControls.tsx     ← ミュート/カメラ/終了
│   └── hooks/
│       ├── useLiveKitRoom.ts      ← Room 接続 + Track 制御
│       └── useMatchingEvents.ts   ← SSE + Data Channel イベント処理
```

### `page.tsx`

```typescript
import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

import { MatchingSession } from "./_components/MatchingSession"

export default async function MatchingSessionPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")
  return <MatchingSession userId={me.id} />
}
```

### `MatchingSession.tsx`（状態マシン）

```typescript
"use client"

type MatchingState = "waiting" | "matched" | "countdown" | "active"

export function MatchingSession({ userId }: { userId: number }) {
  const [state, setState] = useState<MatchingState>("waiting")
  const [session, setSession] = useState<JoinMatchingResponse | null>(null)

  // 1. SSE 購読 (useMatchingEvents)
  // 2. mount 時に POST /api/matching/join
  // 3. レスポンス or SSE で matched → setSession + setState("matched") → 2s 後に countdown
  // 4. countdown 完了で setState("active") + POST /sessions/:id/start + token 取得 + LK Room 接続
  // 5. unmount で DELETE /leave（waiting 時のみ）+ LK disconnect

  return (
    <AnimatePresence mode="wait">
      {state === "waiting" && <WaitingState onCancel={() => leave()} key="waiting" />}
      {state === "matched" && <MatchedState peer={session.peer} key="matched" />}
      {state === "countdown" && <CountdownState onComplete={() => setState("active")} key="countdown" />}
      {state === "active" && <ActiveState session={session} userId={userId} onEnd={() => router.push(`/matching/result?session_id=${session.session_id}`)} key="active" />}
    </AnimatePresence>
  )
}
```

### `useLiveKitRoom.ts`

```typescript
export function useLiveKitRoom(input: { roomName: string; sessionId: number }) {
  const [room, setRoom] = useState<Room | null>(null)
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null)

  useEffect(() => {
    let cancelled = false
    const connect = async () => {
      // POST /api/matching/token で token 取得
      const { token, livekit_url } = await apiClient.post<IssueMatchingTokenResponse>("/api/matching/token", { session_id: input.sessionId })
      if (cancelled) return
      const r = new Room()
      await r.connect(livekit_url, token)
      // ローカル track 公開（カメラ + マイク）
      await r.localParticipant.setCameraEnabled(true)
      await r.localParticipant.setMicrophoneEnabled(true)
      r.on(RoomEvent.ParticipantConnected, (p) => setRemoteParticipant(p))
      r.on(RoomEvent.ParticipantDisconnected, () => setRemoteParticipant(null))
      setRoom(r)
    }
    connect()
    return () => { cancelled = true; room?.disconnect() }
  }, [input.roomName, input.sessionId])

  return { room, remoteParticipant }
}
```

### `useMatchingEvents.ts`

`new EventSource("/api/matching/events")` で SSE 購読。`event: matched` / `event: heartbeat` を type 別に dispatch。

LiveKit Data Channel は `room.on(RoomEvent.DataReceived, (payload, participant, kind, topic) => ...)` で受信。topic ごとに dispatch:

- `matching:theme` → 現在テーマ更新
- `matching:hype` → 盛り上げコメント表示（2 秒）
- `matching:reaction_match` → 紙吹雪 or なし
- `matching:stamp` → StampFloatLayer に追加
- `matching:timer` → 残り時間更新（`can_end_now` で終了ボタン有効化）
- `matching:ended` → setState で結果画面遷移

### Active UI 実装ポイント

- 自分のビデオは `<LocalVideoTrack>` を React 側で `<video>` にマウント。LiveKit SDK の `VideoTrack.attach(videoElement)`
- 相手のビデオは `RemoteParticipant.videoTracks` を listen
- スポットライトは `currentTheme.speaker === "user1" ? user1Side : user2Side` で判定（`is_self_user1` を `getMatchingSession` から取得）
- 選択肢クリック時:
  - ローカルでバブル表示（即時）
  - `POST /api/matching/sessions/:id/reaction`
  - 1.5 秒後に次テーマへ（サーバー側のテーマ進行を待つ）
- 終了ボタン: `can_end_now` が true のときだけ enabled。クリックで `POST /sessions/:id/end` → `/matching/result` 遷移

## 動作確認

### Step 0: before スクショ

新規ページのため不要。

### Lint / Build

```bash
cd apps/web && pnpm lint:fix && pnpm build
```

`/matching/session` がルートに登録されること。

### Playwright MCP（必須）

LiveKit 接続は実環境では複雑だが、最低限以下を確認:

1. cookie 注入で `/matching/session` 遷移
2. **waiting 状態のスクショ**: 三重パルス円 + 待機時間カウントアップ + キャンセルボタン
3. console error 0
4. キャンセルボタンクリックで `/matching` に戻ることを確認

LiveKit Cloud との実接続は dev サーバ + 2 ブラウザでマニュアル確認。

`docs/screenshots/matching-session/after-waiting.png` を保存（waiting 状態が代表）。

## 既知の未対応 / 後続 step に持ち越し

- LiveKit 接続失敗時のリトライ・エラー UI は将来改善
- Data Channel `matching:reaction_match` 受信時の紙吹雪は `<ConfettiEffect>` を再利用（Phase 2 step8）
- ブラウザ permission 拒否（カメラ・マイク）時のフォールバック UI は将来追加
- LiveKit の TURN サーバ設定 / NAT 越え検証は infra 側
