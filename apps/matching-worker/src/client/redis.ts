import Redis from "ioredis"

/**
 * BullMQ 用 Redis client。BullMQ は blocking command を扱う関係で
 * `maxRetriesPerRequest: null` を要求するため、汎用 client とは別インスタンスにする。
 */
export const queueRedis = new Redis({
  db: Number(process.env.REDIS_DB) || 0,
  host: process.env.REDIS_HOST || "localhost",
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})
