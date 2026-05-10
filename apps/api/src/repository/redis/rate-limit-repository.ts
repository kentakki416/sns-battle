import type Redis from "ioredis"

/**
 * 短期レート制限の Repository。
 *
 * Spec1 はマッチング中スタンプ送信の「1 ユーザー 5 req/秒」を初出ユースケース。
 * 実装は Redis の `INCR` + 初回時 `EXPIRE 1` の典型パターン。
 *
 * 「ウィンドウ秒」は呼び出し側で key 設計に折り込んで実現するため、
 * インターフェースに渡さない（例: `stamp_rate:${userId}` で 1 秒固定運用）。
 * 別ウィンドウが必要になったら incrementWithLimit に ttlSeconds を増やせる。
 */
export interface RateLimitRedisRepository {
    /**
     * key のカウントを 1 増やし、limit 以下なら true、超過したら false を返す。
     * 初回（counter=1）のみ EXPIRE 1 を設定するため、自動的に 1 秒ウィンドウになる。
     */
    incrementWithLimit(key: string, limit: number): Promise<boolean>
}

export class IoRedisRateLimitRepository implements RateLimitRedisRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async incrementWithLimit(key: string, limit: number): Promise<boolean> {
    const current = await this._redis.incr(key)
    if (current === 1) {
      /**
       * 1 秒ウィンドウ。EXPIRE は INCR 直後に設定する。
       * INCR 失敗時は EXPIRE も実行されないが、INCR が落ちる状況は Redis 障害なので
       * 上位で 500 として扱われる。
       */
      await this._redis.expire(key, 1)
    }
    return current <= limit
  }
}
