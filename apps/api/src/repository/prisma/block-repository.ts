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
}
