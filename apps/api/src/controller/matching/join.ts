import { Response } from "express"

import { ErrorResponse, joinMatchingResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  BlockRepository,
  MatchingQueueRepository,
  MatchingSessionRepository,
  UserRepository,
} from "../../repository/prisma"
import { MatchingQueueRedisRepository } from "../../repository/redis"
import * as service from "../../service"

/**
 * POST /api/matching/join
 * マッチング待機キューに参加する。即時マッチング成立時は peer / session_id / livekit_room_name を返す。
 */
export class MatchingJoinController {
  constructor(
        private blockRepository: BlockRepository,
        private matchingQueueRedisRepository: MatchingQueueRedisRepository,
        private matchingQueueRepository: MatchingQueueRepository,
        private matchingSessionRepository: MatchingSessionRepository,
        private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingJoinController: join", { userId: req.userId })

    const result = await service.matching.joinMatching(req.userId!, {
      blockRepository: this.blockRepository,
      matchingQueueRedisRepository: this.matchingQueueRedisRepository,
      matchingQueueRepository: this.matchingQueueRepository,
      matchingSessionRepository: this.matchingSessionRepository,
      userRepository: this.userRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const output = result.value
    const response = joinMatchingResponseSchema.parse(
      output.matched
        ? {
          livekit_room_name: output.livekitRoomName,
          matched: true,
          peer: {
            avatar_url: output.peer.avatarUrl,
            id: output.peer.id,
            name: output.peer.name,
          },
          session_id: output.sessionId,
        }
        : {
          livekit_room_name: null,
          matched: false,
          peer: null,
          session_id: null,
        }
    )
    return res.status(200).json(response)
  }
}
