import { Response } from "express"

import { ErrorResponse, getMatchingStatusResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingSessionRepository } from "../../repository/prisma"
import { MatchingQueueRedisRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * GET /api/matching/status
 * 自分の現在の待機状態（WAITING / MATCHED / NONE）を取得する。
 */
export class MatchingStatusController {
  constructor(
        private matchingQueueRedisRepository: MatchingQueueRedisRepository,
        private matchingSessionRepository: MatchingSessionRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingStatusController: status", { userId: req.userId })

    const result = await service.matching.getMatchingStatus(req.userId!, {
      matchingQueueRedisRepository: this.matchingQueueRedisRepository,
      matchingSessionRepository: this.matchingSessionRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMatchingStatusResponseSchema.parse({
      position: result.value.position,
      status: result.value.status,
      waited_seconds: result.value.waitedSeconds,
    })
    return res.status(200).json(response)
  }
}
