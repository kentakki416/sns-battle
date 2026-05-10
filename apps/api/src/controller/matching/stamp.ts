import { Response } from "express"

import {
  ErrorResponse,
  sendMatchingStampPathParamSchema,
  sendMatchingStampRequestSchema,
  sendMatchingStampResponseSchema,
} from "@repo/api-schema"

import { ILiveKitClient } from "../../client/livekit"
import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  ItemRepository,
  MatchingSessionRepository,
  UserInventoryRepository,
} from "../../repository/prisma"
import { RateLimitRedisRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/matching/sessions/:id/stamp
 * セッション中の相手にスタンプを送信。Data Channel `matching:stamp` で Room に配信。
 *
 * - レート制限: 1 ユーザー 5 req/秒（429）
 * - 非 STAMP / 非 MATCHING スコープ → 400
 * - プレミアム未所持 → 403
 */
export class MatchingStampController {
  constructor(
        private itemRepository: ItemRepository,
        private livekitClient: ILiveKitClient,
        private matchingSessionRepository: MatchingSessionRepository,
        private rateLimitRedisRepository: RateLimitRedisRepository,
        private userInventoryRepository: UserInventoryRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = sendMatchingStampPathParamSchema.parse(req.params)
    const body = sendMatchingStampRequestSchema.parse(req.body)
    logger.info("MatchingStampController: send", {
      itemId: body.item_id,
      sessionId: id,
      userId: req.userId,
    })

    const result = await service.matching.sendMatchingStamp(
      { itemId: body.item_id, sessionId: id, userId: req.userId! },
      {
        itemRepository: this.itemRepository,
        matchingSessionRepository: this.matchingSessionRepository,
        rateLimitRedisRepository: this.rateLimitRedisRepository,
        userInventoryRepository: this.userInventoryRepository,
      },
      { livekitClient: this.livekitClient },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const v = result.value
    const response = sendMatchingStampResponseSchema.parse({
      animation_type: v.animationType,
      delivered_at: v.deliveredAt,
      emoji: v.emoji,
      item_id: v.itemId,
    })
    return res.status(200).json(response)
  }
}
