import type Redis from "ioredis"

/**
 * SSE 配信用イベントの payload。型は `@repo/api-schema` の `MatchedMatchingEvent` と一致するが、
 * Repository 層は schema パッケージに依存させたくないため独立した型として定義する。
 */
export type MatchedEventPayload = {
    livekitRoomName: string
    peer: { avatarUrl: string | null; id: number; name: string | null }
    sessionId: number
}

/**
 * マッチング成立イベントを Redis Pub/Sub で publish する Repository。
 *
 * channel 名は `matching:user:{userId}`。マッチング成立時は両ユーザーの channel に同一 payload を publish する。
 */
export interface MatchingEventPublisher {
    publishMatched(userIds: number[], event: MatchedEventPayload): Promise<void>
}

const channelOf = (userId: number): string => `matching:user:${userId}`

export class IoRedisMatchingEventPublisher implements MatchingEventPublisher {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async publishMatched(userIds: number[], event: MatchedEventPayload): Promise<void> {
    /**
     * フロント / SSE は snake_case を期待するため、wire format は snake_case で送る。
     */
    const payload = JSON.stringify({
      livekit_room_name: event.livekitRoomName,
      peer: {
        avatar_url: event.peer.avatarUrl,
        id: event.peer.id,
        name: event.peer.name,
      },
      session_id: event.sessionId,
      type: "matched",
    })
    await Promise.all(
      userIds.map(async (userId) => this._redis.publish(channelOf(userId), payload)),
    )
  }
}
