import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "../prisma/generated/client"

export { PrismaClient }
export type { Prisma } from "../prisma/generated/client"

/**
 * DB_NAME が設定されている場合 DATABASE_URL のDB名部分を置換する（テスト用）。
 * apps/api/src/prisma/prisma.client.ts と同じロジック。
 */
const getConnectionString = (): string => {
  const baseUrl =
    process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/sns-battle_dev"
  const dbName = process.env.DB_NAME
  if (!dbName) return baseUrl
  return baseUrl.replace(/\/[^/?]+(\?|$)/, `/${dbName}$1`)
}

const adapter = new PrismaPg(getConnectionString())

export const prisma = new PrismaClient({ adapter })
