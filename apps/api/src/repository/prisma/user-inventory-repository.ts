import { PrismaClient } from "../../prisma/generated/client"

/**
 * ユーザー所持アイテム（user_inventory）の Repository。
 *
 * Spec1 ではプレミアムスタンプ送信の所持確認のみ必要。Phase 9 の所持品ページや購入処理では
 * findManyByUser 等を追加する想定。
 */
export interface UserInventoryRepository {
    /**
     * ユーザーが指定アイテムを所持しているか（quantity > 0、未失効）。
     * 失効中・quantity=0 は false。
     */
    hasItem(userId: number, itemId: number): Promise<boolean>
}

export class PrismaUserInventoryRepository implements UserInventoryRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async hasItem(userId: number, itemId: number): Promise<boolean> {
    const now = new Date()
    const row = await this._prisma.userInventory.findFirst({
      where: {
        itemId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        quantity: { gt: 0 },
        userId,
      },
    })
    return row !== null
  }
}
