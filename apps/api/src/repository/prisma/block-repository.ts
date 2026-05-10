import { PrismaClient } from "../../prisma/generated/client"

/**
 * ブロック関係（blocks）の Repository。
 *
 * マッチング成立判定で「相手と自分の双方向ブロック関係」を確認するため、
 * 単純な存在確認だけ提供する。
 */
export interface BlockRepository {
    /** A→B または B→A の少なくとも 1 件のブロック関係があれば true */
    existsBetween(userIdA: number, userIdB: number): Promise<boolean>
    /**
     * 指定ユーザーとブロック関係（双方向）にある全ユーザー id を返す。
     * マッチング多段照合で「ブロック相手をスキップ」する際に一括取得して使う。
     */
    findBlockedUserIds(userId: number): Promise<Set<number>>
}

export class PrismaBlockRepository implements BlockRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async existsBetween(userIdA: number, userIdB: number): Promise<boolean> {
    const found = await this._prisma.block.findFirst({
      where: {
        OR: [
          { blockedId: userIdB, blockerId: userIdA },
          { blockedId: userIdA, blockerId: userIdB },
        ],
      },
    })
    return found !== null
  }

  async findBlockedUserIds(userId: number): Promise<Set<number>> {
    const rows = await this._prisma.block.findMany({
      select: { blockedId: true, blockerId: true },
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
    })
    const ids = new Set<number>()
    for (const row of rows) {
      if (row.blockerId !== userId) ids.add(row.blockerId)
      if (row.blockedId !== userId) ids.add(row.blockedId)
    }
    return ids
  }
}
