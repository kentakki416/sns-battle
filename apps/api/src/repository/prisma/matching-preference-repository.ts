import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { Gender, MatchingPreference } from "../../types/domain"

/**
 * MatchingPreference upsert 時の入力。
 */
export type UpsertMatchingPreferenceInput = {
    ageMax: number | null
    ageMin: number | null
    preferredGenders: Gender[]
    preferredHobbyIds: number[]
    preferredLocations: string[]
    preferredMbti: string[]
}

/**
 * マッチングフィルタ設定リポジトリのインターフェース
 */
export interface MatchingPreferenceRepository {
    findByUserId(userId: number): Promise<MatchingPreference | null>
    upsertByUserId(
        userId: number,
        data: UpsertMatchingPreferenceInput
    ): Promise<MatchingPreference>
}

/**
 * Prisma 実装
 */
export class PrismaMatchingPreferenceRepository implements MatchingPreferenceRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findByUserId(userId: number): Promise<MatchingPreference | null> {
    const row = await this._prisma.matchingPreference.findUnique({ where: { userId } })
    if (!row) return null
    return this._toDomain(row)
  }

  async upsertByUserId(
    userId: number,
    data: UpsertMatchingPreferenceInput
  ): Promise<MatchingPreference> {
    const row = await this._prisma.matchingPreference.upsert({
      create: {
        ageMax: data.ageMax,
        ageMin: data.ageMin,
        preferredGenders: data.preferredGenders,
        preferredHobbyIds: data.preferredHobbyIds,
        preferredLocations: data.preferredLocations,
        preferredMbti: data.preferredMbti,
        userId,
      },
      update: {
        ageMax: data.ageMax,
        ageMin: data.ageMin,
        preferredGenders: data.preferredGenders,
        preferredHobbyIds: data.preferredHobbyIds,
        preferredLocations: data.preferredLocations,
        preferredMbti: data.preferredMbti,
      },
      where: { userId },
    })
    return this._toDomain(row)
  }

  /**
     * Prisma の型 → ドメインの型に変換
     */
  private _toDomain(row: PrismaTypes.MatchingPreferenceGetPayload<{}>): MatchingPreference {
    return {
      ageMax: row.ageMax,
      ageMin: row.ageMin,
      id: row.id,
      preferredGenders: row.preferredGenders,
      preferredHobbyIds: row.preferredHobbyIds,
      preferredLocations: row.preferredLocations,
      preferredMbti: row.preferredMbti,
      userId: row.userId,
    }
  }
}
