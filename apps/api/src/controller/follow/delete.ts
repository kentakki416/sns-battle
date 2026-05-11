import { Response } from "express"

import {
  type ErrorResponse,
  unfollowUserPathParamSchema,
  unfollowUserResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { FollowRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * DELETE /api/users/:id/follow
 * 認証ユーザーが path param のユーザーへのフォローを解除する。元々フォローしていなくても 200。
 */
export class FollowDeleteController {
  constructor(private followRepository: FollowRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = unfollowUserPathParamSchema.parse(req.params)
    logger.info("FollowDeleteController: unfollow", { followeeId: id, followerId: req.userId })

    const result = await service.follow.unfollowUser(
      { followeeId: id, followerId: req.userId! },
      { followRepository: this.followRepository },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(unfollowUserResponseSchema.parse({ message: "OK" }))
  }
}
