import { PrismaClient } from "../../prisma/generated/client"
import { Hobby } from "../../types/domain"

/**
 * 趣味マスターのリポジトリインターフェース
 */
export interface HobbyRepository {
    findActiveAll(): Promise<Hobby[]>
    findActiveByIds(ids: number[]): Promise<Hobby[]>
}

/**
 * Prisma 実装
 */
export class PrismaHobbyRepository implements HobbyRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findActiveAll(): Promise<Hobby[]> {
    const rows = await this._prisma.hobbyMaster.findMany({
      orderBy: { sortOrder: "asc" },
      where: { isActive: true },
    })
    return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))
  }

  async findActiveByIds(ids: number[]): Promise<Hobby[]> {
    if (ids.length === 0) return []
    const rows = await this._prisma.hobbyMaster.findMany({
      where: { id: { in: ids }, isActive: true },
    })
    return rows.map((r) => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))
  }
}
