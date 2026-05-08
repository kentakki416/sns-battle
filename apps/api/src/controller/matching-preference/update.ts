import { Response } from "express"

import {
  ErrorResponse,
  updateMatchingPreferenceRequestSchema,
  updateMatchingPreferenceResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { HobbyRepository, MatchingPreferenceRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * PUT /api/matching/preferences
 * 自分のマッチングフィルタ設定を upsert する。
 */
export class MatchingPreferenceUpdateController {
  constructor(
    private matchingPreferenceRepository: MatchingPreferenceRepository,
    private hobbyRepository: HobbyRepository
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const body = updateMatchingPreferenceRequestSchema.parse(req.body)

    logger.info("MatchingPreferenceUpdateController: Upserting preference", {
      userId: req.userId,
    })

    const result = await service.matchingPreference.upsertMatchingPreference(
      {
        data: {
          ageMax: body.age_max,
          ageMin: body.age_min,
          preferredGenders: body.preferred_genders,
          preferredHobbyIds: body.preferred_hobby_ids,
          preferredLocations: body.preferred_locations,
          preferredMbti: body.preferred_mbti,
        },
        userId: req.userId!,
      },
      {
        hobbyRepository: this.hobbyRepository,
        matchingPreferenceRepository: this.matchingPreferenceRepository,
      }
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = updateMatchingPreferenceResponseSchema.parse({
      age_max: result.value.ageMax,
      age_min: result.value.ageMin,
      preferred_genders: result.value.preferredGenders,
      preferred_hobby_ids: result.value.preferredHobbyIds,
      preferred_locations: result.value.preferredLocations,
      preferred_mbti: result.value.preferredMbti,
    })

    return res.status(200).json(response)
  }
}
