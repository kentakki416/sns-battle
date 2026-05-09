import type Redis from "ioredis"

/**
 * マッチング待機キューの Redis Repository インターフェース。
 *
 * Redis Sorted Set `matching:queue` をプライマリストレージとして利用する:
 * - score = キュー参加時刻（ms epoch）
 * - member = userId（文字列化）
 *
 * キュー参加順は score の昇順なので、最古エントリの取得は ZRANGE 0 0 となる。
 */
export interface MatchingQueueRedisRepository {
    /** ZADD でユーザーを登録する。既に WAITING（=メンバー存在）なら false を返し、何もしない。 */
    add(userId: number, joinedAtMs: number): Promise<boolean>
    /** 自分以外の最古ユーザー id を 1 件返す（いない / 自分のみなら null）。 */
    findOldestPeer(myUserId: number): Promise<number | null>
    /** ZSCORE で参加時刻 ms を取得する。いなければ null。 */
    findJoinedAt(userId: number): Promise<number | null>
    /** ZRANK で 0 始まりの位置を取得する。いなければ null。 */
    findPosition(userId: number): Promise<number | null>
    /** ZREM 単体で削除する。 */
    remove(userId: number): Promise<void>
    /** WATCH/MULTI/EXEC で 2 ユーザーを排他的に削除する。両者を同時に削除できなければ false。 */
    removeBothAtomic(userIdA: number, userIdB: number): Promise<boolean>
}

const QUEUE_KEY = "matching:queue"

/**
 * ioredis 実装。
 */
export class IoRedisMatchingQueueRepository implements MatchingQueueRedisRepository {
  private _redis: Redis

  constructor(redis: Redis) {
    this._redis = redis
  }

  async add(userId: number, joinedAtMs: number): Promise<boolean> {
    /**
     * ZADD ... NX で既存メンバーの場合は更新せず、戻り値 0 で「既に存在」を判定する
     */
    const added = await this._redis.zadd(QUEUE_KEY, "NX", joinedAtMs, String(userId))
    return added === 1
  }

  async findOldestPeer(myUserId: number): Promise<number | null> {
    /**
     * 先頭から最大 2 件取得し、自分以外の最初のユーザーを返す。
     * 自分のみなら null、誰もいなければ null。
     */
    const members = await this._redis.zrange(QUEUE_KEY, 0, 1)
    for (const member of members) {
      const id = Number(member)
      if (id !== myUserId) return id
    }
    return null
  }

  async findJoinedAt(userId: number): Promise<number | null> {
    const score = await this._redis.zscore(QUEUE_KEY, String(userId))
    return score === null ? null : Number(score)
  }

  async findPosition(userId: number): Promise<number | null> {
    const rank = await this._redis.zrank(QUEUE_KEY, String(userId))
    return rank === null ? null : rank
  }

  async remove(userId: number): Promise<void> {
    await this._redis.zrem(QUEUE_KEY, String(userId))
  }

  async removeBothAtomic(userIdA: number, userIdB: number): Promise<boolean> {
    /**
     * WATCH で楽観的ロック → 両者がまだキューに存在することを確認 → MULTI/EXEC で原子削除。
     * 競合（他リクエストが先にキューを変更）したら EXEC が null を返すので false。
     */
    await this._redis.watch(QUEUE_KEY)

    const [scoreA, scoreB] = await Promise.all([
      this._redis.zscore(QUEUE_KEY, String(userIdA)),
      this._redis.zscore(QUEUE_KEY, String(userIdB)),
    ])
    if (scoreA === null || scoreB === null) {
      await this._redis.unwatch()
      return false
    }

    const result = await this._redis
      .multi()
      .zrem(QUEUE_KEY, String(userIdA))
      .zrem(QUEUE_KEY, String(userIdB))
      .exec()

    return result !== null
  }
}
