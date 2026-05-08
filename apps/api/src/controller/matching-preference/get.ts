import { Response } from "express"

import { ErrorResponse, getMatchingPreferenceResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingPreferenceRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/matching/preferences
 * 自分のマッチングフィルタ設定を取得する。レコード未作成のユーザーにはデフォルト値を返す。
 */
export class MatchingPreferenceGetController {
  constructor(private matchingPreferenceRepository: MatchingPreferenceRepository) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingPreferenceGetController: Fetching preference", {
      userId: req.userId,
    })

    const result = await service.matchingPreference.getMatchingPreference(req.userId!, {
      matchingPreferenceRepository: this.matchingPreferenceRepository,
    })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getMatchingPreferenceResponseSchema.parse({
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
