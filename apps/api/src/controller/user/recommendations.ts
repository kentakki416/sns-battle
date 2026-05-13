import { Response } from "express"

import {
  type ErrorResponse,
  listRecommendedUsersQueryStringSchema,
  listRecommendedUsersResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  BlockRepository,
  FollowListRepository,
  UserRecommendationRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/users/recommendations
 * 認証ユーザー向けの「おすすめユーザー」リスト（未フォロー・自分除外・双方向ブロック除外・フォロワー数降順）。
 */
export class UserRecommendationsController {
  constructor(
    private blockRepository: BlockRepository,
    private followListRepository: FollowListRepository,
    private userRecommendationRepository: UserRecommendationRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { limit } = listRecommendedUsersQueryStringSchema.parse(req.query)
    logger.info("UserRecommendationsController: list", {
      currentUserId: req.userId,
      limit,
    })

    const result = await service.user.getRecommendedUsers(
      { currentUserId: req.userId!, limit },
      {
        blockRepository: this.blockRepository,
        followListRepository: this.followListRepository,
        userRecommendationRepository: this.userRecommendationRepository,
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
      listRecommendedUsersResponseSchema.parse({
        users: result.value.entries.map((entry) => ({
          avatar_url: entry.avatarUrl,
          bio: entry.bio,
          follower_count: entry.followerCount,
          id: entry.id,
          name: entry.name,
        })),
      }),
    )
  }
}
