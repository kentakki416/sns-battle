import { Response } from "express"

import { type ErrorResponse, getMatchingStampsResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { ItemRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/matching/stamps
 * マッチングセッションで使用可能なスタンプ一覧を返す。クライアントの StampPalette 初期化用。
 */
export class MatchingStampsListController {
  constructor(private itemRepository: ItemRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingStampsListController: list", { userId: req.userId })

    const result = await service.matching.getMatchingStamps({
      itemRepository: this.itemRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMatchingStampsResponseSchema.parse({
      stamps: result.value.stamps.map((s) => ({
        animation_type: s.animationType,
        emoji: s.emoji,
        id: s.id,
        is_premium: s.isPremium,
        name: s.name,
      })),
    })
    return res.status(200).json(response)
  }
}
