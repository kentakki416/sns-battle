/**
 * テスト用 DB / Redis のセットアップヘルパ。
 *
 * - DB_NAME=sns-battle_test に接続（package.json#test スクリプトで指定）
 * - REDIS_DB=1 を test 専用にする（dev は 0）
 * - 各テスト `beforeEach` で `cleanupTestData` / `cleanupTestRedis` を呼ぶ
 *
 * apps/api/test/controller/setup.ts を参考に worker 用に調整。
 */
process.env.DB_NAME = process.env.DB_NAME || "sns-battle_test"
process.env.REDIS_DB = process.env.REDIS_DB || "1"

import Redis from "ioredis"

import { prisma } from "../src/client/prisma"

export { prisma as testPrisma }

/**
 * BullMQ 用 Redis client（test 専用）。`maxRetriesPerRequest: null` が必須。
 * cleanup 用の `testRedis` は別接続で flushdb 用に使う。
 */
export const testQueueRedis = new Redis({
  db: Number(process.env.REDIS_DB) || 1,
  host: process.env.REDIS_HOST || "localhost",
  maxRetriesPerRequest: null,
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})

/**
 * 汎用 Redis（テストの Redis 状態クリア / schedule key 直接読み出し用）。
 */
export const testRedis = new Redis({
  db: Number(process.env.REDIS_DB) || 1,
  host: process.env.REDIS_HOST || "localhost",
  password: process.env.REDIS_PASSWORD || undefined,
  port: Number(process.env.REDIS_PORT) || 6379,
})

let cachedTableNames: string[] | null = null

const fetchTableNames = async (): Promise<string[]> => {
  if (cachedTableNames) return cachedTableNames
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `
  cachedTableNames = rows.map((row) => row.tablename)
  return cachedTableNames
}

/**
 * test 用 DB の全テーブル TRUNCATE CASCADE。各テストは beforeEach で呼び自分で seed する。
 */
export const cleanupTestData = async (): Promise<void> => {
  const names = await fetchTableNames()
  if (names.length === 0) return
  const tables = names.map((name) => `"${name}"`).join(", ")
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`)
}

/**
 * test 用 Redis DB の FLUSHDB（DB 番号で隔離されているため dev / prod に影響なし）。
 */
export const cleanupTestRedis = async (): Promise<void> => {
  await testRedis.flushdb()
}

export const disconnectTestDb = async (): Promise<void> => {
  await prisma.$disconnect()
}

export const disconnectTestRedis = async (): Promise<void> => {
  await Promise.all([testQueueRedis.quit(), testRedis.quit()])
}
