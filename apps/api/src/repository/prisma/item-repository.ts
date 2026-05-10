import { PrismaClient } from "../../prisma/generated/client"
import { StampForMatching } from "../../types/domain"

/**
 * アイテム（items + item_scopes + stamp_details）の Repository。
 *
 * Phase 9（ショップ）では一覧 / 詳細 / 購入なども増えるが、Spec1 のマッチング機能では
 * MATCHING スコープのスタンプ取得のみ必要。
 */
export interface ItemRepository {
    /**
     * 「type=STAMP / is_active=true / item_scopes に MATCHING を含む」item の最小詳細を返す。
     * 該当しない場合（種別違い、非アクティブ、別 scope のみ）は null。
     */
    findActiveStampForMatching(itemId: number): Promise<StampForMatching | null>
}

export class PrismaItemRepository implements ItemRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findActiveStampForMatching(itemId: number): Promise<StampForMatching | null> {
    const row = await this._prisma.item.findFirst({
      include: { stampDetail: true },
      where: {
        id: itemId,
        isActive: true,
        scopes: { some: { scope: "MATCHING" } },
        type: "STAMP",
      },
    })
    /**
     * type=STAMP なら stampDetail は必ず存在する想定（Phase 3.5 の DB 設計）。
     * もし null なら整合性破壊なので null を返してビジネス側 400 として扱わせる。
     */
    if (!row || !row.stampDetail) return null
    return {
      animationType: row.stampDetail.animationType,
      emoji: row.stampDetail.emoji,
      id: row.id,
      isPremium: row.isPremium,
      name: row.name,
    }
  }
}
