# 技術選定

## 目次

- [配信・リアルタイム通信技術の比較検討](#配信リアルタイム通信技術の比較検討)
  - [候補一覧](#候補一覧)
  - [候補詳細](#候補詳細)
  - [比較表](#比較表)
  - [採用結論: LiveKit](#採用結論-livekit)
- [フロントエンド技術](#フロントエンド技術)
- [バックエンド技術](#バックエンド技術)
- [認証技術](#認証技術)
- [リアルタイムデータ通信（チャット・スタンプ等）](#リアルタイムデータ通信チャットスタンプ等)
- [採用技術スタック一覧](#採用技術スタック一覧)
- [LiveKit 詳細ガイド](#livekit-詳細ガイド)
  - [LiveKit とは](#livekit-とは)
  - [アーキテクチャ概要](#アーキテクチャ概要)
  - [主要コンセプト](#主要コンセプト)
  - [サーバー SDK の使い方](#サーバー-sdk-の使い方)
  - [クライアント SDK の使い方](#クライアント-sdk-の使い方)
  - [Data Channel の使い方](#data-channel-の使い方)
  - [Ingress（配信入力）の使い方](#ingress配信入力の使い方)
  - [Webhook の使い方](#webhook-の使い方)
  - [SNS Battle での利用パターン](#sns-battle-での利用パターン)

---

## 配信・リアルタイム通信技術の比較検討

SNS Battle の3機能（配信・マッチング・バトル）に必要な要件:

1. **1対多のライブ配信**（配信機能）: 配信者 → 多数の視聴者へのビデオ/音声ストリーミング
2. **1対1のビデオ通話**（マッチング機能）: 低遅延の双方向ビデオ/音声通信
3. **1対1 + 多数の観客**（バトル機能）: 2名の対戦者がビデオ配信し、多数の観客が視聴
4. **リアルタイムデータ送受信**: チャット、スタンプ、トークテーマ、リアクションなどの低遅延メッセージング
5. **ブラウザから直接配信**: OBS 不要で、ブラウザのカメラ/マイクから配信開始できること

### 候補一覧

| # | 技術 | 種別 |
|---|------|------|
| 1 | **LiveKit** | OSS WebRTC SFU + マネージドクラウド |
| 2 | **Agora** | 商用 WebRTC PaaS |
| 3 | **Mux** | ビデオ配信特化 PaaS |
| 4 | **MediaSoup** | OSS WebRTC SFU（自前運用） |
| 5 | **自前 WebRTC + Socket.IO** | フルスクラッチ |

### 候補詳細

#### 1. LiveKit

- **概要**: オープンソースの WebRTC SFU。マネージドクラウド（LiveKit Cloud）も提供
- **配信**: Ingress（RTMP/WHIP）でブラウザ配信・OBS 配信の両方に対応
- **1対1通話**: WebRTC Room に2名参加で低遅延ビデオ通話
- **多人数**: Room に参加者を追加し、Publish 権限で配信者/視聴者を制御
- **データ通信**: Data Channel でテキスト・バイナリメッセージのブロードキャスト可能
- **SDK**: `livekit-server-sdk`（Node.js）、`@livekit/components-react`（React UI）、`livekit-client`（ブラウザ）
- **料金**: Cloud は従量課金。Self-hosted は無料（インフラコストのみ）
- **実績**: 参考プロジェクト（nextjs-twitch-clone）で使用済み。コードの再利用可能

#### 2. Agora

- **概要**: 商用のリアルタイム通信 PaaS。世界的に広く利用
- **配信**: Interactive Live Streaming で1対多配信に対応
- **1対1通話**: Video Call SDK で低遅延通信
- **多人数**: 最大数千人の視聴者をサポート
- **データ通信**: Signaling SDK で可能だが、別途セットアップが必要
- **SDK**: Agora Web SDK（独自 API）
- **料金**: 月10,000分まで無料。それ以降は従量課金（$3.99/1,000分〜）
- **懸念**: ベンダーロックイン。自前サーバーとの統合が LiveKit ほどシームレスではない

#### 3. Mux

- **概要**: ビデオ配信に特化した PaaS。HLS ベースの低遅延配信
- **配信**: HLS Live Streaming で1対多配信（遅延: 3〜10秒）
- **1対1通話**: **非対応**。WebRTC ベースの通話機能は提供していない
- **データ通信**: なし。別途 WebSocket 実装が必要
- **懸念**: マッチング・バトルの低遅延ビデオ通話に使えないため、別の技術と併用が必須

#### 4. MediaSoup

- **概要**: オープンソースの WebRTC SFU。Node.js + C++ ベース
- **配信**: SFU として1対多配信可能
- **1対1通話**: WebRTC Room で対応
- **多人数**: SFU アーキテクチャで多人数に対応
- **データ通信**: Data Channel で可能
- **懸念**: **完全自前運用**が必要。シグナリングサーバー、TURN サーバー、スケーリングすべて自前で構築。LiveKit と比べて抽象度が低く、開発コストが大幅に増加

#### 5. 自前 WebRTC + Socket.IO

- **概要**: WebRTC API を直接使用し、シグナリングに Socket.IO を使用
- **配信**: Peer-to-Peer では1対多にスケールしない。SFU/MCU が必要
- **1対1通話**: P2P で低遅延通信可能
- **データ通信**: Socket.IO でリアルタイムメッセージング
- **懸念**: **1対多配信に SFU が必須**で、結局 MediaSoup や LiveKit を使うことになる。車輪の再発明

### 比較表

| 要件 | LiveKit | Agora | Mux | MediaSoup | 自前 WebRTC |
|------|---------|-------|-----|-----------|------------|
| 1対多配信 | ○ | ○ | ○ | ○ | △（SFU必要） |
| 1対1通話 | ○ | ○ | ✕ | ○ | ○（P2P） |
| 1対1 + 観客 | ○ | ○ | ✕ | ○ | △ |
| ブラウザ配信 | ○（WHIP） | ○ | △（RTMP推奨） | ○ | ○ |
| Data Channel | ○（組み込み） | △（別SDK） | ✕ | ○ | △（Socket.IO併用） |
| React SDK | ○（公式） | ○ | ○ | ✕ | ✕ |
| 自前サーバー統合 | ○（Node.js SDK） | △ | △ | ○ | ○ |
| Self-hosted 可能 | ○（OSS） | ✕ | ✕ | ○（OSS） | ○ |
| 開発コスト | **低** | 中 | 高（併用必要） | **高** | **非常に高** |
| 運用コスト | 低〜中 | 中 | 中 | 高（自前運用） | 非常に高 |
| 参考実装あり | ○（twitch-clone） | ✕ | ✕ | ✕ | ✕ |

### 採用結論: LiveKit

**LiveKit を採用する**。理由:

1. **全要件を単一プラットフォームでカバー**: 1対多配信、1対1通話、多人数ルーム、Data Channel のすべてを LiveKit だけで実現できる。他の候補は複数技術の組み合わせが必要
2. **Data Channel の統合**: チャット・スタンプ・トークテーマ・リアクションなどのリアルタイムデータ送受信を、別途 WebSocket サーバーを立てずに LiveKit の Data Channel で実現できる（→ **WebSocket サーバーの自前運用が不要**）
3. **ブラウザ直接配信**: WHIP プロトコルにより、OBS なしでブラウザのカメラ/マイクから直接配信開始できる
4. **参考実装の再利用**: twitch-clone プロジェクトの LiveKit 実装（トークン生成、Ingress 管理、Webhook、ストリームプレイヤー）をそのまま活用可能
5. **React SDK 充実**: `@livekit/components-react` がビデオ表示・接続管理・チャットの UI コンポーネントを提供。開発効率が高い
6. **OSS + Cloud の選択肢**: 開発中は LiveKit Cloud（無料枠あり）を使い、将来的にコスト最適化のため Self-hosted に移行可能
7. **Publish 権限制御**: トークン生成時に細かく権限を設定でき、「配信者のみ配信可、視聴者は視聴のみ」「バトルでは対戦者2名のみ配信可」といった制御が容易

**使用パッケージ**:
| パッケージ | バージョン | 用途 |
|-----------|-----------|------|
| `livekit-server-sdk` | ^2.x | Express API でのトークン生成、ルーム管理、Ingress 管理 |
| `@livekit/components-react` | ^2.x | React UI コンポーネント（ビデオ、チャット） |
| `livekit-client` | ^2.x | ブラウザ側の WebRTC 接続管理 |

---

## フロントエンド技術

| 技術 | バージョン | 用途 | 採用理由 |
|------|-----------|------|----------|
| Next.js | 16 (App Router) | Web アプリケーション | 既存プロジェクトで採用済み。Server Components / Server Actions / Route Handler で API 通信を最適化 |
| React | 19 | UI ライブラリ | Next.js 16 のデフォルト |
| Tailwind CSS | v4 | スタイリング | 既存プロジェクトで採用済み。ダーク UI の実装に適した utility-first CSS |
| shadcn/ui | latest | UI コンポーネント | Radix UI ベースのアクセシブルなコンポーネント。ダークテーマとの相性が良い |
| Zustand | ^4.x | クライアント状態管理 | サイドバー開閉、チャット状態、マッチング状態などの UI ステート管理。軽量で React 外からもアクセス可能 |
| Framer Motion | ^11.x | アニメーション | カウントダウン、スタンプフロート、画面遷移のアニメーション実装 |
| canvas-confetti | ^1.x | 紙吹雪エフェクト | マッチングのリアクション一致時の演出。軽量で Canvas ベース |
| Lucide React | latest | アイコン | shadcn/ui と同じアイコンセット |
| Sonner | ^1.x | トースト通知 | マッチング成立、バトル招待などの通知表示 |

---

## バックエンド技術

| 技術 | バージョン | 用途 | 採用理由 |
|------|-----------|------|----------|
| Express.js | ^4.x | API サーバー | 既存プロジェクトで採用済み。レイヤードアーキテクチャ（Repository/Service/Controller）が構築済み |
| Prisma | ^6.x | ORM | 既存プロジェクトで採用済み。型安全なデータアクセス |
| PostgreSQL | 16 | メインデータベース | 既存プロジェクトで採用済み |
| Redis | ^7.x | キャッシュ、キュー管理 | マッチングキューの管理、スタンプカウントのリアルタイム集計、セッション管理 |
| Zod | ^3.x | バリデーション | 既存の `@repo/api-schema` パッケージで利用。API リクエスト/レスポンスの型安全な検証 |

---

## 認証技術

| 技術 | 用途 | 採用理由 |
|------|------|----------|
| 自前 Google OAuth 実装 | ログイン / サインアップ | 既存の `auth_accounts` テーブルと JWT 認証ミドルウェアが実装済み。Clerk 等の外部サービスを使わず、将来の TikTok / X / Instagram 追加にも柔軟に対応可能 |
| JWT (Access + Refresh Token) | セッション管理 | Access Token（15分）+ Refresh Token（7日）のローテーション。HttpOnly Cookie で管理 |

**Clerk を不採用にした理由**:
- 参考プロジェクト（twitch-clone）では Clerk を使用しているが、sns-battle では TikTok / X / Instagram 等の日本のソーシャルメディアプロバイダー対応が必要
- Clerk は TikTok OAuth を標準サポートしていない
- 既に自前の認証基盤（`auth_accounts` テーブル + JWT ミドルウェア）が構築済み
- 外部サービスへの依存を減らし、認証フローを完全にコントロールしたい

---

## リアルタイムデータ通信（チャット・スタンプ等）

### 検討: 自前 WebSocket サーバー vs LiveKit Data Channel

| 観点 | 自前 WebSocket (Socket.IO) | LiveKit Data Channel |
|------|---------------------------|---------------------|
| 追加サーバー | **必要**（WebSocket サーバーの構築・運用） | **不要**（LiveKit Room に統合） |
| スケーリング | Redis Pub/Sub + 複数ノード管理が必要 | LiveKit Cloud が自動スケール |
| 遅延 | 低遅延（WebSocket） | 低遅延（WebRTC Data Channel） |
| 認証 | 別途 WebSocket 用の認証実装が必要 | LiveKit トークンに統合（追加認証不要） |
| ルーム管理 | 自前実装（join/leave/broadcast） | LiveKit Room と同一（ビデオ参加者 = データ受信者） |
| 開発コスト | 高（サーバー構築 + クライアント実装） | **低**（LiveKit SDK の `useChat()` やカスタム Data Channel） |

### 採用結論: LiveKit Data Channel

**自前 WebSocket サーバーは立てず、LiveKit Data Channel を使用する**。

理由:
- チャット・スタンプ・トークテーマ・リアクションなどのリアルタイムデータは、すべて「同じ LiveKit Room に接続しているユーザー間」でやり取りされる
- ビデオ参加者とデータ受信者が完全に一致するため、別途 WebSocket 接続を管理する必要がない
- LiveKit トークンで認証済みのユーザーのみがデータ送受信でき、セキュリティ的にもシンプル
- `@livekit/components-react` の `useChat()` フックでチャット実装が容易
- カスタムイベント（スタンプ、テーマ、リアクション）は `room.localParticipant.publishData()` で送信

**ただし、以下のケースでは別途 WebSocket or ポーリングが必要**:
- マッチングキューの待機状態通知（LiveKit Room 接続前）→ Redis Pub/Sub + SSE（Server-Sent Events）で対応
- ホーム画面のライブ状態更新 → LiveKit Webhook + DB 更新 + Next.js の ISR/revalidation で対応

---

## 採用技術スタック一覧

```
┌─────────────────────────────────────────────────┐
│                   Frontend                       │
│  Next.js 16 + React 19 + Tailwind CSS v4        │
│  shadcn/ui + Zustand + Framer Motion            │
│  @livekit/components-react + livekit-client      │
├─────────────────────────────────────────────────┤
│                   Backend                        │
│  Express.js + Prisma + Zod (@repo/api-schema)   │
│  livekit-server-sdk                              │
├─────────────────────────────────────────────────┤
│                 Data Stores                      │
│  PostgreSQL 16 (main DB)                         │
│  Redis 7 (queue, cache, pub/sub)                 │
├─────────────────────────────────────────────────┤
│              Real-time / Media                   │
│  LiveKit Cloud (WebRTC SFU)                      │
│  - Video/Audio streaming                         │
│  - Data Channel (chat, stamps, reactions)        │
│  - Ingress (WHIP/RTMP)                          │
│  - Webhook (room/participant events)             │
├─────────────────────────────────────────────────┤
│               Infrastructure                     │
│  AWS (ECS, RDS, ElastiCache, ALB, S3, CloudFront)│
│  Terraform (IaC)                                 │
│  Docker                                          │
└─────────────────────────────────────────────────┘
```

---

## LiveKit 詳細ガイド

### LiveKit とは

LiveKit はオープンソースの **WebRTC SFU（Selective Forwarding Unit）** プラットフォーム。ビデオ/音声のリアルタイム配信と、Data Channel によるメッセージングを提供する。

**SFU とは**: 参加者間のメディアストリームを中継するサーバー。P2P（ピアツーピア）では参加者数が増えると各端末の負荷が指数的に増加するが、SFU を経由することで各端末は SFU とのみ接続すればよく、1対多・多対多のスケーラビリティが確保される。

```
P2P (3人の場合):          SFU (3人の場合):
A ←→ B                   A ←→ SFU ←→ B
A ←→ C                         ↕
B ←→ C                         C
(6本の接続)               (3本の接続)
```

### アーキテクチャ概要

```
┌─────────────────────────────────────────────────────┐
│                   LiveKit Cloud                      │
│                                                     │
│  ┌───────────┐  ┌───────────┐  ┌───────────┐      │
│  │  Room A   │  │  Room B   │  │  Room C   │      │
│  │ (配信)    │  │(マッチング)│  │ (バトル)  │      │
│  │           │  │           │  │           │      │
│  │ Host→SFU  │  │ A↔SFU↔B  │  │ H↔SFU↔O  │      │
│  │ SFU→V1   │  │           │  │ SFU→V1〜N │      │
│  │ SFU→V2   │  │           │  │           │      │
│  │ SFU→V3   │  │           │  │           │      │
│  └───────────┘  └───────────┘  └───────────┘      │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Ingress Gateway                 │   │
│  │  WHIP (ブラウザ配信) / RTMP (OBS配信)        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Webhook Service                 │   │
│  │  → Express API に HTTP POST でイベント通知    │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
         ↕ WebSocket (WSS)           ↕ HTTP
┌─────────────────┐         ┌──────────────────┐
│   ブラウザ       │         │   Express API    │
│ (livekit-client) │         │(livekit-server-sdk)│
└─────────────────┘         └──────────────────┘
```

### 主要コンセプト

| コンセプト | 説明 |
|-----------|------|
| **Room** | 参加者がメディアを共有する論理空間。配信、マッチング、バトルごとに1つのRoomを作成 |
| **Participant** | Room に参加しているユーザー。`identity` で一意に識別 |
| **Track** | 参加者が公開するメディアストリーム。Camera Track、Microphone Track など |
| **Token** | Room に接続するための認証トークン。サーバーサイドで生成し、権限（Publish/Subscribe）を制御 |
| **Ingress** | 外部からの入力ソース。WHIP（ブラウザ）や RTMP（OBS）を通じてメディアを Room に入力 |
| **Data Channel** | 参加者間でテキスト/バイナリデータをリアルタイム送受信するチャネル。Reliable（TCP的）と Lossy（UDP的）の2モード |
| **Webhook** | LiveKit がサーバーに HTTP で通知するイベント。Room の開始/終了、参加者の入退室など |

### サーバー SDK の使い方

`livekit-server-sdk` を Express API で使用する。

#### インストール

```bash
cd apps/api
pnpm add livekit-server-sdk
```

#### トークン生成

```typescript
import { AccessToken } from "livekit-server-sdk"

/**
 * LiveKit Room に接続するためのトークンを生成する
 */
export const generateLiveKitToken = (
  roomName: string,
  identity: string,
  options: {
    canPublish?: boolean
    canSubscribe?: boolean
    canPublishData?: boolean
  }
): string => {
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    {
      identity,
      ttl: "1h", // トークン有効期限: 1時間
    }
  )

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: options.canPublish ?? false,
    canSubscribe: options.canSubscribe ?? true,
    canPublishData: options.canPublishData ?? false,
  })

  return token.toJwt()
}
```

**利用例（各機能）**:
```typescript
/** 配信者トークン */
const streamerToken = generateLiveKitToken(`stream:${userId}`, `host-${userId}`, {
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
})

/** 視聴者トークン（ログイン済み） */
const viewerToken = generateLiveKitToken(`stream:${streamerId}`, `viewer-${userId}`, {
  canPublish: false,
  canSubscribe: true,
  canPublishData: true, // コメント・スタンプ送信用
})

/** マッチング通話トークン */
const matchingToken = generateLiveKitToken(`matching:${sessionId}`, `user-${userId}`, {
  canPublish: true,   // カメラ・マイク
  canSubscribe: true, // 相手の映像・音声
  canPublishData: true, // リアクション
})

/** バトル対戦者トークン */
const battlePlayerToken = generateLiveKitToken(`battle:${roomId}`, `player-${userId}`, {
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
})

/** バトル観客トークン */
const battleViewerToken = generateLiveKitToken(`battle:${roomId}`, `viewer-${userId}`, {
  canPublish: false,    // ビデオ/音声は配信しない
  canSubscribe: true,   // 対戦者の映像を視聴
  canPublishData: true, // コメント・スタンプ送信
})
```

#### Room 管理

```typescript
import { RoomServiceClient } from "livekit-server-sdk"

const roomService = new RoomServiceClient(
  process.env.LIVEKIT_URL,
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
)

/** Room 一覧取得 */
const rooms = await roomService.listRooms()

/** 特定の Room の参加者一覧 */
const participants = await roomService.listParticipants("battle:1")

/** 参加者をキック（ブロック時） */
await roomService.removeParticipant("stream:1", `viewer-${blockedUserId}`)

/** Room にデータを送信（サーバーからの通知） */
await roomService.sendData(
  "matching:1",
  new TextEncoder().encode(JSON.stringify({
    type: "matching:theme",
    themeId: 1,
    title: "好きな食べ物は？",
    choices: [{ id: 1, label: "和食", emoji: "🍣" }],
    roundNumber: 1,
  })),
  { reliable: true }
)
```

### クライアント SDK の使い方

#### React コンポーネントでの利用

`@livekit/components-react` が提供する高レベルコンポーネントを使用:

```tsx
import { LiveKitRoom, VideoTrack, useRemoteParticipant } from "@livekit/components-react"

/**
 * 配信視聴コンポーネント
 */
function StreamViewer({ token, wsUrl, hostIdentity }: Props) {
  return (
    <LiveKitRoom
      token={token}
      serverUrl={wsUrl}
      connect={true}
    >
      <StreamVideo hostIdentity={hostIdentity} />
      <StreamChat />
    </LiveKitRoom>
  )
}

/**
 * ホスト（配信者）のビデオを表示
 */
function StreamVideo({ hostIdentity }: { hostIdentity: string }) {
  const participant = useRemoteParticipant(hostIdentity)

  if (!participant) {
    return <OfflineMessage />
  }

  return (
    <div className="relative aspect-video">
      <VideoTrack
        participant={participant}
        source={Track.Source.Camera}
      />
      {/* スタンプアニメーションレイヤー */}
      <StampFloatLayer />
    </div>
  )
}
```

#### マッチング/バトルでの利用

```tsx
/**
 * 1対1ビデオ通話コンポーネント
 */
function MatchingCall({ token, wsUrl }: Props) {
  return (
    <LiveKitRoom token={token} serverUrl={wsUrl} connect={true}>
      <div className="grid grid-cols-2 gap-4">
        <RemoteVideo />  {/* 相手の映像 */}
        <LocalVideo />   {/* 自分の映像 */}
      </div>
      <ControlBar />     {/* ミュート、カメラ切替 */}
    </LiveKitRoom>
  )
}

/**
 * 自分の映像表示（Publish中）
 */
function LocalVideo() {
  const { localParticipant } = useLocalParticipant()
  return <VideoTrack participant={localParticipant} source={Track.Source.Camera} />
}
```

#### 接続状態の管理

```tsx
import { useConnectionState } from "@livekit/components-react"
import { ConnectionState } from "livekit-client"

function ConnectionStatus() {
  const connectionState = useConnectionState()

  if (connectionState === ConnectionState.Connecting) {
    return <LoadingSpinner />
  }
  if (connectionState === ConnectionState.Disconnected) {
    return <ReconnectButton />
  }
  return null
}
```

### Data Channel の使い方

LiveKit の Data Channel でチャット・スタンプ・トークテーマなどのリアルタイムデータを送受信する。

#### チャットの実装（`useChat` フック）

`@livekit/components-react` には組み込みの `useChat` フックがある:

```tsx
import { useChat } from "@livekit/components-react"

function ChatPanel() {
  const { chatMessages, send } = useChat()

  const handleSend = (message: string) => {
    send(message)
  }

  return (
    <div>
      {chatMessages.map((msg) => (
        <div key={msg.timestamp}>
          <span style={{ color: stringToColor(msg.from?.identity ?? "") }}>
            {msg.from?.name}:
          </span>
          <span>{msg.message}</span>
        </div>
      ))}
      <ChatInput onSend={handleSend} />
    </div>
  )
}
```

#### カスタム Data Channel（スタンプ・テーマ等）

`useChat` ではカバーしきれないカスタムイベントは、`room.localParticipant.publishData()` と `room.on(RoomEvent.DataReceived)` で実装:

```tsx
import { useRoomContext } from "@livekit/components-react"
import { RoomEvent, DataPacket_Kind } from "livekit-client"

/**
 * スタンプの送信
 */
function useStampSender() {
  const room = useRoomContext()

  const sendStamp = (stampId: number, target?: "HOST" | "OPPONENT") => {
    const data = JSON.stringify({
      type: "battle:stamp",
      userId: getCurrentUserId(),
      stampId,
      target,
    })

    room.localParticipant.publishData(
      new TextEncoder().encode(data),
      { reliable: false } // Lossy モード（低遅延、再送なし）
    )
  }

  return { sendStamp }
}

/**
 * スタンプの受信
 */
function useStampReceiver(onStampReceived: (stamp: StampEvent) => void) {
  const room = useRoomContext()

  useEffect(() => {
    const handleData = (
      payload: Uint8Array,
      participant: RemoteParticipant | undefined
    ) => {
      const data = JSON.parse(new TextDecoder().decode(payload))
      if (data.type === "battle:stamp") {
        onStampReceived(data)
      }
    }

    room.on(RoomEvent.DataReceived, handleData)
    return () => {
      room.off(RoomEvent.DataReceived, handleData)
    }
  }, [room, onStampReceived])
}
```

#### サーバーからの Data Channel 送信

サーバーサイド（Express API）からRoom内の参加者にデータを送信:

```typescript
import { RoomServiceClient } from "livekit-server-sdk"

/**
 * トークテーマをRoom内の全参加者に送信
 */
export const sendThemeToRoom = async (
  roomName: string,
  theme: { themeId: number; title: string; choices: Choice[]; roundNumber: number }
) => {
  const roomService = new RoomServiceClient(
    process.env.LIVEKIT_URL,
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  )

  const payload = new TextEncoder().encode(JSON.stringify({
    type: "matching:theme",
    ...theme,
  }))

  await roomService.sendData(roomName, payload, {
    reliable: true, // テーマ通知は確実に届ける
  })
}
```

### Ingress（配信入力）の使い方

Ingress は外部からの映像/音声入力を LiveKit Room に接続する仕組み。

#### WHIP Ingress（ブラウザ配信）

ブラウザから WebRTC で直接配信する方式。OBS 不要。

```typescript
import { IngressClient, IngressInput } from "livekit-server-sdk"

/**
 * WHIP Ingress を作成（ブラウザ配信用）
 */
export const createWhipIngress = async (userId: number, userName: string) => {
  const ingressClient = new IngressClient(process.env.LIVEKIT_URL)

  const ingress = await ingressClient.createIngress(IngressInput.WHIP_INPUT, {
    name: `stream:${userId}`,
    roomName: `stream:${userId}`,
    participantIdentity: `host-${userId}`,
    participantName: userName,
  })

  return {
    ingressId: ingress.ingressId,
    serverUrl: ingress.url,     // WHIP サーバーURL
    streamKey: ingress.streamKey, // 認証キー
  }
}
```

#### RTMP Ingress（OBS 配信）- 将来対応

```typescript
/**
 * RTMP Ingress を作成（OBS等の配信ソフト用）
 */
export const createRtmpIngress = async (userId: number, userName: string) => {
  const ingressClient = new IngressClient(process.env.LIVEKIT_URL)

  const ingress = await ingressClient.createIngress(IngressInput.RTMP_INPUT, {
    name: `stream:${userId}`,
    roomName: `stream:${userId}`,
    participantIdentity: `host-${userId}`,
    participantName: userName,
    video: {
      source: TrackSource.CAMERA,
      encodingOptions: {
        /* エンコード設定 */
      },
    },
    audio: {
      source: TrackSource.MICROPHONE,
    },
  })

  return {
    ingressId: ingress.ingressId,
    serverUrl: ingress.url,     // rtmp://xxx.livekit.cloud/x
    streamKey: ingress.streamKey,
  }
}
```

### Webhook の使い方

LiveKit Cloud がサーバーに HTTP POST でイベントを通知する。

#### Express API での受信

```typescript
import { WebhookReceiver } from "livekit-server-sdk"

const webhookReceiver = new WebhookReceiver(
  process.env.LIVEKIT_API_KEY,
  process.env.LIVEKIT_API_SECRET
)

/**
 * LiveKit Webhook エンドポイント
 */
app.post("/api/webhooks/livekit", async (req, res) => {
  try {
    /** 署名検証 + イベント解析 */
    const event = await webhookReceiver.receive(
      req.body,                   // raw body (string)
      req.headers.authorization   // Bearer トークン
    )

    switch (event.event) {
      case "ingress_started":
        /** 配信開始 → is_live を true に */
        await streamRepository.updateByIngressId(event.ingressInfo.ingressId, {
          isLive: true,
        })
        break

      case "ingress_ended":
        /** 配信終了 → is_live を false に */
        await streamRepository.updateByIngressId(event.ingressInfo.ingressId, {
          isLive: false,
        })
        break

      case "participant_joined":
        /** 参加者入室（視聴者数カウント等） */
        logger.info(`Participant joined: ${event.participant.identity}`)
        break

      case "participant_left":
        /** 参加者退室（マッチング/バトルでの相手離脱検知） */
        logger.info(`Participant left: ${event.participant.identity}`)
        break

      case "room_finished":
        /** Room 終了（マッチング/バトルの終了処理） */
        logger.info(`Room finished: ${event.room.name}`)
        break
    }

    res.status(200).json({ message: "OK" })
  } catch (error) {
    logger.error("Webhook verification failed", error)
    res.status(401).json({ error: "Invalid webhook" })
  }
})
```

**注意**: Webhook を受信するには、Express API の raw body パーサーが必要:
```typescript
app.use("/api/webhooks/livekit", express.raw({ type: "application/webhook+json" }))
```

#### LiveKit Cloud でのWebhook URL設定

LiveKit Cloud Dashboard で Webhook URL を設定:
- 開発: `https://{ngrokのURL}/api/webhooks/livekit`（ngrok でローカルを公開）
- 本番: `https://api.snsbattle.com/api/webhooks/livekit`

### SNS Battle での利用パターン

各機能でのLiveKit利用をまとめる:

| 機能 | Room 命名 | 参加者構成 | Publish 権限 | Data Channel |
|------|----------|-----------|-------------|-------------|
| 配信 | `stream:{userId}` | 1配信者 + N視聴者 | 配信者のみ | チャット、スタンプ |
| マッチング | `matching:{sessionId}` | 2ユーザー | 両方 | テーマ通知、リアクション、タイマー |
| バトル | `battle:{roomId}` | 2対戦者 + N観客 | 対戦者2名のみ | コメント、スタンプ、ターン通知、結果 |

**Room のライフサイクル**:
- 配信: Ingress 開始で自動作成 → Ingress 終了で自動削除
- マッチング: マッチング成立時にサーバーから作成 → 通話終了時に削除
- バトル: バトル開始時にサーバーから作成 → バトル終了時に削除
