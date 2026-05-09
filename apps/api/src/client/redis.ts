import Redis from "ioredis"

export const redis = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
  lazyConnect: true,
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})

/**
 * BullMQ 用 Redis client。BullMQ は blocking command を扱うため
 * `maxRetriesPerRequest: null` を要求する。汎用 client とは別インスタンスにする。
 */
export const queueRedis = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})
