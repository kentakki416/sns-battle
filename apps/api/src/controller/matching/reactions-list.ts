import { Response } from "express"

import {
  ErrorResponse,
  getReactionsPathParamSchema,
  getReactionsResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  MatchingReactionRepository,
  MatchingSessionRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/matching/sessions/:id/reactions
 * 結果画面用に、全ラウンドのリアクションを round 昇順で返す。
 * 相手未回答の round も含める（peer_choice=null）。
 */
export class MatchingReactionsListController {
  constructor(
        private matchingReactionRepository: MatchingReactionRepository,
        private matchingSessionRepository: MatchingSessionRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = getReactionsPathParamSchema.parse(req.params)
    logger.info("MatchingReactionsListController: list", { sessionId: id, userId: req.userId })

    const result = await service.matching.getReactions(
      { sessionId: id, userId: req.userId! },
      {
        matchingReactionRepository: this.matchingReactionRepository,
        matchingSessionRepository: this.matchingSessionRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getReactionsResponseSchema.parse({
      rounds: result.value.rounds.map((r) => ({
        is_match: r.isMatch,
        my_choice: r.myChoice,
        peer_choice: r.peerChoice,
        round_number: r.roundNumber,
        theme: r.theme,
      })),
    })
    return res.status(200).json(response)
  }
}
