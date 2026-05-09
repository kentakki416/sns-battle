import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { MatchingQueue } from "../../types/domain"

/**
 * マッチング待機キュー（DB 側、監査・バックアップ用）の Repository。
 *
 * プライマリは Redis Sorted Set。本テーブルは Redis 障害時のフォールバック / 後追い分析用。
 * status は WAITING / MATCHED / CANCELLED の 3 種だが、実運用は WAITING のみが書き込まれる。
 */
export interface MatchingQueueRepository {
    deleteByUserId(userId: number): Promise<void>
    findByUserId(userId: number): Promise<MatchingQueue | null>
    /** WAITING で upsert。重複参加防止は Redis 側に任せ、DB は最新状態を保持するだけ。 */
    upsertWaiting(userId: number): Promise<MatchingQueue>
}

export class PrismaMatchingQueueRepository implements MatchingQueueRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<MatchingQueue | null> {
    const row = await this._prisma.matchingQueue.findUnique({ where: { userId } })
    if (!row) return null
    return this._toDomain(row)
  }

  async upsertWaiting(userId: number): Promise<MatchingQueue> {
    const row = await this._prisma.matchingQueue.upsert({
      create: { status: "WAITING", userId },
      update: { status: "WAITING" },
      where: { userId },
    })
    return this._toDomain(row)
  }

  async deleteByUserId(userId: number): Promise<void> {
    await this._prisma.matchingQueue.deleteMany({ where: { userId } })
  }

  private _toDomain(row: PrismaTypes.MatchingQueueGetPayload<{}>): MatchingQueue {
    return {
      createdAt: row.createdAt,
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt,
      userId: row.userId,
    }
  }
}
