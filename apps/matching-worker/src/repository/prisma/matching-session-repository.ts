import { Prisma as PrismaTypes, PrismaClient } from "../../client/prisma"
import { MatchingEndReason, MatchingSession } from "../../types/domain"

/**
 * セッションと両参加者の MBTI を同時に取得した結果。
 * advance-theme ジョブが schedule 新規生成時に相性スコアを算出するために使う。
 */
export type MatchingSessionWithUserMbtis = {
    session: MatchingSession
    user1Mbti: string | null
    user2Mbti: string | null
}

/**
 * worker 用 MatchingSessionRepository。
 *
 * worker からは「現在の status / startedAt を読んで進行可否を判定し、必要なら ENDED に倒す」
 * 用途のみなので、`findById` と `markEnded` の最小 2 メソッドだけ提供する。
 *
 * apps/api 側の同名 Repository とは分離している（責務最小化のため）。互換は不要だが、
 * `_toDomain` の構造は揃えておくことで両者の domain を比較しやすくする。
 */
export interface MatchingSessionRepository {
    findById(id: number): Promise<MatchingSession | null>
    /**
     * セッションと両参加者の MBTI 値をまとめて取得する。
     * advance-theme ジョブで schedule 新規生成時に相性スコアを算出するために使う。
     */
    findByIdWithUserMbtis(id: number): Promise<MatchingSessionWithUserMbtis | null>
    /**
     * セッションを ENDED に遷移させる。`endedAt = now()` をセットする。
     * 冪等性は呼び出し側（ジョブ）で確認する前提（既に ENDED は呼ぶ前に弾く）。
     */
    markEnded(id: number, endReason: MatchingEndReason): Promise<MatchingSession>
}

export class PrismaMatchingSessionRepository implements MatchingSessionRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(id: number): Promise<MatchingSession | null> {
    const row = await this._prisma.matchingSession.findUnique({ where: { id } })
    if (!row) return null
    return this._toDomain(row)
  }

  async findByIdWithUserMbtis(id: number): Promise<MatchingSessionWithUserMbtis | null> {
    const row = await this._prisma.matchingSession.findUnique({
      include: {
        user1: { select: { mbti: true } },
        user2: { select: { mbti: true } },
      },
      where: { id },
    })
    if (!row) return null
    return {
      session: this._toDomain(row),
      user1Mbti: row.user1.mbti,
      user2Mbti: row.user2.mbti,
    }
  }

  async markEnded(id: number, endReason: MatchingEndReason): Promise<MatchingSession> {
    const row = await this._prisma.matchingSession.update({
      data: {
        endedAt: new Date(),
        endReason,
        status: "ENDED",
      },
      where: { id },
    })
    return this._toDomain(row)
  }

  private _toDomain(row: PrismaTypes.MatchingSessionGetPayload<{}>): MatchingSession {
    return {
      createdAt: row.createdAt,
      endedAt: row.endedAt,
      endReason: row.endReason,
      id: row.id,
      livekitRoomName: row.livekitRoomName,
      startedAt: row.startedAt,
      status: row.status,
      user1Id: row.user1Id,
      user2Id: row.user2Id,
    }
  }
}
