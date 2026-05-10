import { AccessToken, type VideoGrant } from "livekit-server-sdk"

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
 * LiveKit Server SDK の薄いラッパー interface。
 * テスト時には jest.fn() で差し替え可能にする。
 */
export interface ILiveKitClient {
    /**
     * 指定ルームへの接続用 JWT を発行する。
     */
    generateRoomToken(input: GenerateRoomTokenInput): Promise<string>
}

/**
 * 本番用 LiveKit クライアント。`AccessToken` を使って JWT を生成する。
 *
 * 既定の VideoGrant は両ユーザーの双方向通話を想定し、
 * `canPublish` / `canPublishData` / `canSubscribe` / `roomJoin` を全て許可する。
 */
export class LiveKitClient implements ILiveKitClient {
  constructor(
        private readonly apiKey: string,
        private readonly apiSecret: string,
  ) {}

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
}
