import { Response } from "express"

import { ErrorResponse, getUserPathParamSchema, getUserResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/users/:id
 * 指定ユーザーのプロフィール情報を返却する。閲覧者と同一ユーザーなら birth_date / coin_balance も返す。
 */
export class UserGetController {
  constructor(private userRepository: UserRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = getUserPathParamSchema.parse(req.params)

    logger.info("UserGetController: Fetching user profile", {
      targetUserId: id,
      viewerUserId: req.userId,
    })

    const result = await service.user.getUserProfile(
      { targetUserId: id, viewerUserId: req.userId! },
      { userRepository: this.userRepository }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getUserResponseSchema.parse({
      age: result.value.age,
      avatar_url: result.value.avatarUrl,
      bio: result.value.bio,
      birth_date: result.value.birthDate ? result.value.birthDate.toISOString().slice(0, 10) : null,
      coin_balance: result.value.coinBalance,
      created_at: result.value.createdAt.toISOString(),
      gender: result.value.gender,
      hobbies: result.value.hobbies.map((h) => ({ id: h.id, name: h.name })),
      id: result.value.id,
      is_onboarded: result.value.isOnboarded,
      is_self: result.value.isSelf,
      location: result.value.location,
      mbti: result.value.mbti,
      name: result.value.name,
    })

    return res.status(200).json(response)
  }
}
