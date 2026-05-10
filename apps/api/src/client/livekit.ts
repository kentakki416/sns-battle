import {
  AccessToken,
  DataPacket_Kind,
  RoomServiceClient,
  type VideoGrant,
  WebhookReceiver,
  type WebhookEvent,
} from "livekit-server-sdk"

/**
 * LiveKit Room 接続用 JWT 発行のリクエスト引数。
 *
 * - `roomName`: 接続先 LiveKit ルーム名（DB の `livekit_room_name` と一致させる）
 * - `identity`: ルーム内で一意な参加者 ID（マッチングでは `user:{userId}`）
 * - `metadata`: LiveKit が participant に付与するメタデータ（任意）
 * - `grant`: VideoGrant の上書き（既定は publish/subscribe/data 全許可）
 * - `ttlSeconds`: トークンの有効期限（既定 3600 秒 = 1 時間）
 */
export type GenerateRoomTokenInput = {
    grant?: Partial<VideoGrant>
    identity: string
    metadata?: string
    roomName: string
    ttlSeconds?: number
}

/**
 * Data Channel 配信のリクエスト引数。
 *
 * - `roomName`: 配信先ルーム
 * - `topic`: クライアント側で購読を分岐するキー（例: "matching:reaction_match"）
 * - `payload`: JSON シリアライズ可能なオブジェクト。クライアントは JSON.parse で取り出す
 */
export type PublishDataInput = {
    payload: object
    roomName: string
    topic: string
}

/**
 * LiveKit Server SDK の薄いラッパー interface。
 * テスト時には jest.fn() で差し替え可能にする。
 */
export interface ILiveKitClient {
    /**
     * 指定ルームへの接続用 JWT を発行する。
     */
    generateRoomToken(input: GenerateRoomTokenInput): Promise<string>
    /**
     * Data Channel 経由でルーム内の全参加者に payload をブロードキャストする。
     * リアクション一致通知（step6）/ テーマ進行（step8）等で使用。
     */
    publishData(input: PublishDataInput): Promise<void>
}

/**
 * 本番用 LiveKit クライアント。`AccessToken` で JWT を生成し、`RoomServiceClient` 経由で
 * Data Channel を配信する。両者で同じ apiKey/apiSecret を使う。
 *
 * 既定の VideoGrant は両ユーザーの双方向通話を想定し、
 * `canPublish` / `canPublishData` / `canSubscribe` / `roomJoin` を全て許可する。
 */
export class LiveKitClient implements ILiveKitClient {
  private readonly roomService: RoomServiceClient

  constructor(
        private readonly host: string,
        private readonly apiKey: string,
        private readonly apiSecret: string,
  ) {
    this.roomService = new RoomServiceClient(host, apiKey, apiSecret)
  }

  async generateRoomToken(input: GenerateRoomTokenInput): Promise<string> {
    const ttl = input.ttlSeconds ?? 3600
    const at = new AccessToken(this.apiKey, this.apiSecret, {
      identity: input.identity,
      metadata: input.metadata,
      ttl,
    })
    at.addGrant({
      canPublish: true,
      canPublishData: true,
      canSubscribe: true,
      room: input.roomName,
      roomJoin: true,
      ...input.grant,
    })
    return at.toJwt()
  }

  async publishData(input: PublishDataInput): Promise<void> {
    const payload = new TextEncoder().encode(JSON.stringify(input.payload))
    /**
     * RELIABLE で送信。droppable な heartbeat 系は LOSSY を選ぶが、
     * リアクション一致通知やテーマ切替は確実に届ける必要があるため RELIABLE 固定。
     */
    await this.roomService.sendData(input.roomName, payload, DataPacket_Kind.RELIABLE, {
      topic: input.topic,
    })
  }
}

/**
 * LiveKit から送られる Webhook を受け付け、署名検証して `WebhookEvent` を返す interface。
 * テスト時は jest.fn() で差し替え、実 SDK の署名検証は実装側に閉じ込める。
 */
export interface ILiveKitWebhookReceiver {
    /**
     * Express の raw body 文字列と Authorization ヘッダから WebhookEvent を返す。
     * 署名不正・ヘッダ無し・SDK が例外を投げた場合は null を返す（呼び出し側で 401）。
     */
    receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null>
}

/**
 * 本番用 Webhook receiver。`WebhookReceiver` は Phase 4 step9 で導入し、
 * `apiKey` / `apiSecret` は LiveKit Cloud の設定値（step4 で .env.local に登録済）。
 *
 * SDK の `receive` は署名不正で throw するため try/catch で null に正規化する。
 */
export class LiveKitWebhookReceiverImpl implements ILiveKitWebhookReceiver {
  private readonly receiver: WebhookReceiver

  constructor(apiKey: string, apiSecret: string) {
    this.receiver = new WebhookReceiver(apiKey, apiSecret)
  }

  async receive(rawBody: string, authHeader: string | undefined): Promise<WebhookEvent | null> {
    if (!authHeader) return null
    try {
      return await this.receiver.receive(rawBody, authHeader)
    } catch {
      return null
    }
  }
}
