import type Redis from "ioredis"

/**
 * マッチングイベント subscribe 用の Repository。
 *
 * 単一の subscribe 専用 Redis 接続を共有し、ユーザーごとに channel `matching:user:{userId}` を購読する。
 * 同一ユーザーの複数タブ（複数 handler）に対応するため、内部で userId → handlers Set のマップを保持する。
 * - subscribe: 初回 handler 登録時のみ実 SUBSCRIBE、2 回目以降は handler 追加のみ
 * - unsubscribe: handler を 1 件削除し、最後の handler が消えたら実 UNSUBSCRIBE
 */
export type MatchingEventHandler = (payload: string) => void

export interface MatchingEventSubscriber {
    subscribe(userId: number, handler: MatchingEventHandler): Promise<void>
    unsubscribe(userId: number, handler: MatchingEventHandler): Promise<void>
}

const channelOf = (userId: number): string => `matching:user:${userId}`
const parseUserIdFromChannel = (channel: string): number | null => {
  const match = channel.match(/^matching:user:(\d+)$/)
  return match ? Number(match[1]) : null
}

export class IoRedisMatchingEventSubscriber implements MatchingEventSubscriber {
  private _redis: Redis
  private _handlers = new Map<number, Set<MatchingEventHandler>>()

  constructor(redis: Redis) {
    this._redis = redis
    this._redis.on("message", (channel: string, payload: string) => {
      const userId = parseUserIdFromChannel(channel)
      if (userId === null) return
      const handlers = this._handlers.get(userId)
      if (!handlers) return
      for (const handler of handlers) {
        try {
          handler(payload)
        } catch {
          /** 個別 handler の失敗で他 handler を巻き込まない */
        }
      }
    })
  }

  async subscribe(userId: number, handler: MatchingEventHandler): Promise<void> {
    let handlers = this._handlers.get(userId)
    if (!handlers) {
      handlers = new Set()
      this._handlers.set(userId, handlers)
      await this._redis.subscribe(channelOf(userId))
    }
    handlers.add(handler)
  }

  async unsubscribe(userId: number, handler: MatchingEventHandler): Promise<void> {
    const handlers = this._handlers.get(userId)
    if (!handlers) return
    handlers.delete(handler)
    if (handlers.size === 0) {
      this._handlers.delete(userId)
      await this._redis.unsubscribe(channelOf(userId))
    }
  }
}
