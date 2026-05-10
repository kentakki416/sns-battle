import Redis from "ioredis"

export const redis = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
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
  maxRetriesPerRequest: null, // Redis接続が瞬断しても、接続が戻るまで永遠に待つ
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})

/**
 * Pub/Sub の subscribe 専用クライアント。
 * ioredis は subscribe モードに入ると同じ接続で他コマンドを送れないため、汎用 client / publisher とは
 * 別インスタンスにする必要がある。SSE エンドポイントの subscribe 用途に使う。
 */
export const redisSubscriber = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})
