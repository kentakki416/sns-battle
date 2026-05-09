import { Response } from "express"

import { ErrorResponse, leaveMatchingResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingQueueRepository } from "../../repository/prisma"
import { MatchingQueueRedisRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * DELETE /api/matching/leave
 * マッチング待機キューから離脱する。元々参加していなくても 200 を返す（冪等）。
 */
export class MatchingLeaveController {
  constructor(
        private matchingQueueRedisRepository: MatchingQueueRedisRepository,
        private matchingQueueRepository: MatchingQueueRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingLeaveController: leave", { userId: req.userId })

    const result = await service.matching.leaveMatching(req.userId!, {
      matchingQueueRedisRepository: this.matchingQueueRedisRepository,
      matchingQueueRepository: this.matchingQueueRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(leaveMatchingResponseSchema.parse({ message: "OK" }))
  }
}
