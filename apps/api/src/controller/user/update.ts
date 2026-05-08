import { Response } from "express"

import {
  ErrorResponse,
  updateUserPathParamSchema,
  updateUserRequestSchema,
  updateUserResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { HobbyRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PUT /api/users/:id
 * 自分のプロフィールを更新する。他人の更新は 403、不在は 404、不正値は 400。
 */
export class UserUpdateController {
  constructor(
    private userRepository: UserRepository,
    private hobbyRepository: HobbyRepository
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = updateUserPathParamSchema.parse(req.params)
    const body = updateUserRequestSchema.parse(req.body)

    logger.info("UserUpdateController: Updating profile", {
      targetUserId: id,
      viewerUserId: req.userId,
    })

    const result = await service.user.updateUserProfile(
      {
        data: {
          ...(body.avatar_url !== undefined ? { avatarUrl: body.avatar_url } : {}),
          ...(body.bio !== undefined ? { bio: body.bio } : {}),
          ...(body.birth_date !== undefined ? { birthDate: new Date(body.birth_date) } : {}),
          ...(body.gender !== undefined ? { gender: body.gender } : {}),
          ...(body.hobby_ids !== undefined ? { hobbyIds: body.hobby_ids } : {}),
          ...(body.location !== undefined ? { location: body.location } : {}),
          ...(body.mbti !== undefined ? { mbti: body.mbti } : {}),
          ...(body.name !== undefined ? { name: body.name } : {}),
        },
        targetUserId: id,
        viewerUserId: req.userId!,
      },
      { hobbyRepository: this.hobbyRepository, userRepository: this.userRepository }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = updateUserResponseSchema.parse({
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
