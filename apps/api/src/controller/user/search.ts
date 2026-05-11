import { Response } from "express"

import {
  type ErrorResponse,
  searchUsersQueryStringSchema,
  searchUsersResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { BlockRepository, UserSearchRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/users/search
 * 認証ユーザー視点で他ユーザーを部分一致検索する。双方向ブロック関係にあるユーザーは結果から除外される。
 */
export class UserSearchController {
  constructor(
    private blockRepository: BlockRepository,
    private userSearchRepository: UserSearchRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { cursor, limit, q } = searchUsersQueryStringSchema.parse(req.query)
    logger.info("UserSearchController: search", { cursor, currentUserId: req.userId, limit, q })

    const result = await service.user.searchUsers(
      { cursor, currentUserId: req.userId!, limit, query: q },
      {
        blockRepository: this.blockRepository,
        userSearchRepository: this.userSearchRepository,
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
      searchUsersResponseSchema.parse({
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
