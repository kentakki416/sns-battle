import { Response } from "express"

import {
  endMatchingSessionPathParamSchema,
  endMatchingSessionResponseSchema,
  ErrorResponse,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingSessionRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/matching/sessions/:id/end
 * セッションを手動で終了する（reason=MANUAL 固定）。5 分未満は 400 で拒否。
 *
 * TIMEOUT / USER_LEFT 終了は step8 / step9 のサーバー側処理から Service を直接呼ぶ想定。
 */
export class MatchingSessionEndController {
  constructor(private matchingSessionRepository: MatchingSessionRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = endMatchingSessionPathParamSchema.parse(req.params)
    logger.info("MatchingSessionEndController: end", { sessionId: id, userId: req.userId })

    const result = await service.matching.endMatchingSession(
      { reason: "MANUAL", sessionId: id, userId: req.userId! },
      { matchingSessionRepository: this.matchingSessionRepository },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    /**
     * markEnded で endedAt / endReason は必ず非 null。型上 null 許容なので明示変換する。
     */
    const session = result.value
    const response = endMatchingSessionResponseSchema.parse({
      ended_at: session.endedAt!.toISOString(),
      end_reason: session.endReason!,
      id: session.id,
      status: session.status,
    })
    return res.status(200).json(response)
  }
}
