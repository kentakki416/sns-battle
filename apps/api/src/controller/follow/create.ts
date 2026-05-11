import { Response } from "express"

import {
  type ErrorResponse,
  followUserPathParamSchema,
  followUserResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  BlockRepository,
  FollowRepository,
  UserRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/users/:id/follow
 * 認証ユーザーが path param のユーザーをフォローする。
 */
export class FollowCreateController {
  constructor(
    private blockRepository: BlockRepository,
    private followRepository: FollowRepository,
    private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = followUserPathParamSchema.parse(req.params)
    logger.info("FollowCreateController: follow", { followeeId: id, followerId: req.userId })

    const result = await service.follow.followUser(
      { followeeId: id, followerId: req.userId! },
      {
        blockRepository: this.blockRepository,
        followRepository: this.followRepository,
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

    return res.status(200).json(
      followUserResponseSchema.parse({
        followee_id: result.value.followeeId,
        follower_id: result.value.followerId,
      }),
    )
  }
}
