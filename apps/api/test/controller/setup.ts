// テスト用の接続先を指定（import 前にセットする必要がある）
process.env.DB_NAME = "sns-battle_test"
process.env.REDIS_DB = "1"

import { queueRedis, redis } from "../../src/client/redis"
import { prisma } from "../../src/prisma/prisma.client"

export { prisma as testPrisma }
export { redis as testRedis }

/**
 * schema.prisma の @@map で定義されたテーブル名の一覧
 * モデル追加時はここにもテーブル名を追加すること
 */
const TABLE_NAMES = [
  "users",
  "auth_accounts",
  "memos",
  "hobby_masters",
  "user_hobbies",
  "matching_preferences",
]

/**
 * テスト間でデータをクリーンアップする（全テーブルを TRUNCATE CASCADE する）
 * PostgreSQL の TRUNCATE ... CASCADE で FK 制約を含めて一括削除する
 * 各テストは beforeEach で呼び出し、必要なデータは自分で seed する方針
 */
export const cleanupTestData = async (): Promise<void> => {
  const tables = TABLE_NAMES.map((name) => `"${name}"`).join(", ")
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE`)
}

/**
 * テスト間でRedisデータをクリーンアップする
 * FLUSHDB はテスト用DB番号のみをクリアするため、開発用データに影響しない
 */
export const cleanupTestRedis = async (): Promise<void> => {
  await redis.flushdb()
}

/**
 * テスト終了時にDB接続を切断する
 */
export const disconnectTestDb = async (): Promise<void> => {
  await prisma.$disconnect()
}

/**
 * テスト終了時にRedis接続を切断する
 * 汎用 redis と BullMQ 用 queueRedis の両方を閉じる
 */
export const disconnectTestRedis = async (): Promise<void> => {
  await Promise.all([redis.quit(), queueRedis.quit()])
}
