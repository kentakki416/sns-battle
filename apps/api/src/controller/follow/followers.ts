import { Response } from "express"

import {
  type ErrorResponse,
  listFollowersPathParamSchema,
  listFollowersQueryStringSchema,
  listFollowersResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { FollowListRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/users/:id/followers
 * 指定ユーザーをフォローしているユーザー一覧をページネーション付きで返す。
 */
export class FollowersListController {
  constructor(
    private followListRepository: FollowListRepository,
    private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = listFollowersPathParamSchema.parse(req.params)
    const { cursor, limit } = listFollowersQueryStringSchema.parse(req.query)
    logger.info("FollowersListController: list", { cursor, limit, targetUserId: id })

    const result = await service.follow.getFollowers(
      { cursor, limit, targetUserId: id },
      {
        followListRepository: this.followListRepository,
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
      listFollowersResponseSchema.parse({
        next_cursor: result.value.nextCursor,
        users: result.value.entries.map((entry) => ({
          avatar_url: entry.avatarUrl,
          bio: entry.bio,
          id: entry.id,
          name: entry.name,
        })),
      }),
    )
  }
}
