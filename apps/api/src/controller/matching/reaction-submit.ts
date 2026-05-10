import { Response } from "express"

import {
  ErrorResponse,
  submitReactionPathParamSchema,
  submitReactionRequestSchema,
  submitReactionResponseSchema,
} from "@repo/api-schema"

import { ILiveKitClient } from "../../client/livekit"
import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  MatchingReactionRepository,
  MatchingSessionRepository,
  TalkThemeRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/matching/sessions/:id/reaction
 * 自分の round 回答を保存し、相手も同 round に回答済なら一致判定 + Data Channel 配信。
 */
export class MatchingReactionSubmitController {
  constructor(
        private livekitClient: ILiveKitClient,
        private matchingReactionRepository: MatchingReactionRepository,
        private matchingSessionRepository: MatchingSessionRepository,
        private talkThemeRepository: TalkThemeRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = submitReactionPathParamSchema.parse(req.params)
    const body = submitReactionRequestSchema.parse(req.body)
    logger.info("MatchingReactionSubmitController: submit", {
      roundNumber: body.round_number,
      sessionId: id,
      themeId: body.theme_id,
      userId: req.userId,
    })

    const result = await service.matching.submitReaction(
      {
        choiceId: body.choice_id,
        roundNumber: body.round_number,
        sessionId: id,
        themeId: body.theme_id,
        userId: req.userId!,
      },
      {
        matchingReactionRepository: this.matchingReactionRepository,
        matchingSessionRepository: this.matchingSessionRepository,
        talkThemeRepository: this.talkThemeRepository,
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
    const response = submitReactionResponseSchema.parse({
      matched: v.matched,
      my_choice: v.myChoice,
      peer_choice: v.peerChoice,
      reaction_id: v.reactionId,
    })
    return res.status(200).json(response)
  }
}
