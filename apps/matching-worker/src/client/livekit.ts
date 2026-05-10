import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk"

/**
 * Data Channel 配信のリクエスト引数。
 *
 * - `roomName`: 配信先 LiveKit ルーム（DB の `livekit_room_name` と一致）
 * - `topic`: クライアント側で購読を分岐するキー（例: "matching:theme"）
 * - `payload`: JSON シリアライズ可能なオブジェクト
 */
export type PublishDataInput = {
    payload: object
    roomName: string
    topic: string
}

/**
 * worker 専用の LiveKit Data Channel 配信 interface。worker は token 発行も Webhook 受信も行わず、
 * Data Channel への publish のみを行うため、apps/api の `ILiveKitClient` よりさらに最小化している。
 *
 * テスト時は `jest.fn()` でモックして「publish が期待 topic / payload で呼ばれたか」を assert する。
 */
export interface ILiveKitDataPublisher {
    publishData(input: PublishDataInput): Promise<void>
}

/**
 * 本番用 LiveKit Data Publisher。`RoomServiceClient.sendData` を RELIABLE で呼ぶ。
 * テーマ進行 / タイマー / 終了通知はいずれも droppable では困るため LOSSY は使わない。
 */
export class LiveKitDataPublisher implements ILiveKitDataPublisher {
  private readonly roomService: RoomServiceClient

  constructor(host: string, apiKey: string, apiSecret: string) {
    this.roomService = new RoomServiceClient(host, apiKey, apiSecret)
  }

  async publishData(input: PublishDataInput): Promise<void> {
    const payload = new TextEncoder().encode(JSON.stringify(input.payload))
    await this.roomService.sendData(input.roomName, payload, DataPacket_Kind.RELIABLE, {
      topic: input.topic,
    })
  }
}
