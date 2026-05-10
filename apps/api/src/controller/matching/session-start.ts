import { Response } from "express"

import {
  type ErrorResponse,
  startMatchingSessionPathParamSchema,
  startMatchingSessionResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingSessionRepository } from "../../repository/prisma"
import { ThemeProgressEnqueuer } from "../../repository/queue"
import * as service from "../../service"

/**
 * POST /api/matching/sessions/:id/start
 * セッションを COUNTDOWN → ACTIVE に遷移させ、テーマ進行ジョブを `theme-progress` queue に enqueue する。
 *
 * 実ジョブ消化（advance-theme / publish-timer / session-timeout）は step8b で
 * `apps/matching-worker` に実装される。本コントローラは enqueue までを担当する。
 */
export class MatchingSessionStartController {
  constructor(
    private matchingSessionRepository: MatchingSessionRepository,
    private themeProgressEnqueuer: ThemeProgressEnqueuer,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = startMatchingSessionPathParamSchema.parse(req.params)
    logger.info("MatchingSessionStartController: start", { sessionId: id, userId: req.userId })

    const result = await service.matching.startMatchingSession(
      { sessionId: id, userId: req.userId! },
      { matchingSessionRepository: this.matchingSessionRepository },
      { themeProgressEnqueuer: this.themeProgressEnqueuer },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = startMatchingSessionResponseSchema.parse({
      session_id: result.value.sessionId,
      started_at: result.value.startedAt.toISOString(),
    })
    return res.status(200).json(response)
  }
}
