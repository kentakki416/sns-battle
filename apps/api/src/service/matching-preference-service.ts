import { logger } from "../log"
import { HobbyRepository, MatchingPreferenceRepository } from "../repository/prisma"
import { Gender, MatchingPreference } from "../types/domain"
import { badRequestError, err, ok, Result } from "../types/result"

/**
 * レコード未作成のユーザー向けのデフォルト値（全配列空、age_min/max=null）。
 * id は 0 のセンチネル。フロントは使用しない（DB に保存される際に自動採番される）。
 */
const buildDefaultPreference = (userId: number): MatchingPreference => ({
  ageMax: null,
  ageMin: null,
  id: 0,
  preferredGenders: [],
  preferredHobbyIds: [],
  preferredLocations: [],
  preferredMbti: [],
  userId,
})

/**
 * 自分のマッチングフィルタを取得する。レコード未作成の場合はデフォルト値を返す（404 にしない）。
 */
export const getMatchingPreference = async (
  userId: number,
  repo: { matchingPreferenceRepository: MatchingPreferenceRepository }
): Promise<Result<MatchingPreference>> => {
  logger.debug("MatchingPreferenceService: Fetching preference", { userId })
  const found = await repo.matchingPreferenceRepository.findByUserId(userId)
  return ok(found ?? buildDefaultPreference(userId))
}

/**
 * upsert 時の入力。Service 層と Repository 層で同形だが、責務分離のため独立した型を持つ。
 */
export type UpsertMatchingPreferenceServiceInput = {
  ageMax: number | null
  ageMin: number | null
  preferredGenders: Gender[]
  preferredHobbyIds: number[]
  preferredLocations: string[]
  preferredMbti: string[]
}

/**
 * 自分のマッチングフィルタを upsert する。
 * - age_min > age_max（両方値がある場合）→ 400 BAD_REQUEST
 * - preferred_hobby_ids に未登録 / 無効化済の id → 400 BAD_REQUEST
 */
export const upsertMatchingPreference = async (
  input: { data: UpsertMatchingPreferenceServiceInput; userId: number },
  repo: {
    hobbyRepository: HobbyRepository
    matchingPreferenceRepository: MatchingPreferenceRepository
  }
): Promise<Result<MatchingPreference>> => {
  const { data, userId } = input
  logger.debug("MatchingPreferenceService: Upserting preference", { userId })

  if (data.ageMin !== null && data.ageMax !== null && data.ageMin > data.ageMax) {
    return err(badRequestError("age_min must be less than or equal to age_max"))
  }

  if (data.preferredHobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.preferredHobbyIds)
    if (found.length !== data.preferredHobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  const upserted = await repo.matchingPreferenceRepository.upsertByUserId(userId, data)
  return ok(upserted)
}
