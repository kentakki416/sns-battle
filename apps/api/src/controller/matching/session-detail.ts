import { Response } from "express"

import {
  ErrorResponse,
  getMatchingSessionPathParamSchema,
  getMatchingSessionResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingSessionRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/matching/sessions/:id
 * セッション参加者のみ閲覧可。VS レイアウトに必要な user1 / user2 と
 * 経過秒・can_end_now を返す。
 */
export class MatchingSessionDetailController {
  constructor(
        private matchingSessionRepository: MatchingSessionRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = getMatchingSessionPathParamSchema.parse(req.params)
    logger.info("MatchingSessionDetailController: get", { sessionId: id, userId: req.userId })

    const result = await service.matching.getMatchingSession(
      { sessionId: id, userId: req.userId! },
      {
        matchingSessionRepository: this.matchingSessionRepository,
        userRepository: this.userRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const view = result.value
    const response = getMatchingSessionResponseSchema.parse({
      can_end_now: view.canEndNow,
      elapsed_seconds: view.elapsedSeconds,
      ended_at: view.session.endedAt ? view.session.endedAt.toISOString() : null,
      end_reason: view.session.endReason,
      id: view.session.id,
      is_self_user1: view.isSelfUser1,
      livekit_room_name: view.session.livekitRoomName,
      mbti_compatibility: view.mbtiCompatibility,
      started_at: view.session.startedAt ? view.session.startedAt.toISOString() : null,
      status: view.session.status,
      user1: {
        id: view.user1.id,
        avatar_url: view.user1.avatarUrl,
        mbti: view.user1.mbti,
        name: view.user1.name,
      },
      user2: {
        id: view.user2.id,
        avatar_url: view.user2.avatarUrl,
        mbti: view.user2.mbti,
        name: view.user2.name,
      },
    })
    return res.status(200).json(response)
  }
}
