import { Response } from "express"

import {
  completeOnboardingPathParamSchema,
  completeOnboardingRequestSchema,
  completeOnboardingResponseSchema,
  ErrorResponse,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { HobbyRepository, UserRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PUT /api/users/:id/onboarding
 * 初回プロフィール設定を一括登録し、is_onboarded=true にする。
 */
export class UserOnboardingController {
  constructor(
    private userRepository: UserRepository,
    private hobbyRepository: HobbyRepository
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = completeOnboardingPathParamSchema.parse(req.params)
    const body = completeOnboardingRequestSchema.parse(req.body)

    logger.info("UserOnboardingController: Completing onboarding", {
      targetUserId: id,
      viewerUserId: req.userId,
    })

    const result = await service.user.completeOnboarding(
      {
        data: {
          bio: body.bio ?? null,
          birthDate: new Date(body.birth_date),
          gender: body.gender,
          hobbyIds: body.hobby_ids ?? [],
          location: body.location ?? null,
          mbti: body.mbti ?? null,
          name: body.name,
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

    const response = completeOnboardingResponseSchema.parse({
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
