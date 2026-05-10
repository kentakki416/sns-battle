import { Response } from "express"

import {
  ErrorResponse,
  issueMatchingTokenRequestSchema,
  issueMatchingTokenResponseSchema,
} from "@repo/api-schema"

import { ILiveKitClient } from "../../client/livekit"
import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingSessionRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/matching/token
 * 指定セッションへの LiveKit Room 接続トークンを発行する。
 *
 * 参加者本人のみ取得可能。ENDED セッションは 410、参加者以外は 403。
 */
export class MatchingTokenController {
  constructor(
        private livekitClient: ILiveKitClient,
        private livekitUrl: string,
        private matchingSessionRepository: MatchingSessionRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const body = issueMatchingTokenRequestSchema.parse(req.body)
    logger.info("MatchingTokenController: issueToken", {
      sessionId: body.session_id,
      userId: req.userId,
    })

    const result = await service.matching.issueMatchingToken(
      { sessionId: body.session_id, userId: req.userId! },
      { matchingSessionRepository: this.matchingSessionRepository },
      { livekitClient: this.livekitClient, livekitUrl: this.livekitUrl },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = issueMatchingTokenResponseSchema.parse({
      expires_at: result.value.expiresAt,
      livekit_url: result.value.livekitUrl,
      room_name: result.value.roomName,
      token: result.value.token,
    })
    return res.status(200).json(response)
  }
}
