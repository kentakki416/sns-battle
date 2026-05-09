import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { MatchingSession } from "../../types/domain"

/**
 * マッチングセッション（matching_sessions）の Repository。
 *
 * livekit_room_name は `matching:${sessionId}` 形式で一意に決まるが、autoincrement の id を
 * 知るためには一旦 INSERT する必要がある。そこで Repository 内のトランザクションで
 *   1) tempName で create
 *   2) 採番された id を使って livekit_room_name を `matching:${id}` に update
 * の 2 step を 1 つの API として提供する。
 */
export interface MatchingSessionRepository {
    create(input: { user1Id: number; user2Id: number }): Promise<MatchingSession>
    /** 自分が user1 / user2 のどちらでも参加しており、status が ENDED 以外のセッションを 1 件返す */
    findActiveByUserId(userId: number): Promise<MatchingSession | null>
    findById(id: number): Promise<MatchingSession | null>
}

export class PrismaMatchingSessionRepository implements MatchingSessionRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async create(input: { user1Id: number; user2Id: number }): Promise<MatchingSession> {
    const session = await this._prisma.$transaction(async (tx) => {
      /**
       * 一時的な livekit_room_name で先に create し、確定した id でリネームする。
       * 並行実行で衝突しないように tempName にユーザー id とタイムスタンプを入れる。
       */
      const tempName = `pending:${Date.now()}:${input.user1Id}:${input.user2Id}`
      const created = await tx.matchingSession.create({
        data: {
          livekitRoomName: tempName,
          user1Id: input.user1Id,
          user2Id: input.user2Id,
        },
      })
      return tx.matchingSession.update({
        data: { livekitRoomName: `matching:${created.id}` },
        where: { id: created.id },
      })
    })
    return this._toDomain(session)
  }

  async findById(id: number): Promise<MatchingSession | null> {
    const row = await this._prisma.matchingSession.findUnique({ where: { id } })
    if (!row) return null
    return this._toDomain(row)
  }

  async findActiveByUserId(userId: number): Promise<MatchingSession | null> {
    const row = await this._prisma.matchingSession.findFirst({
      orderBy: { createdAt: "desc" },
      where: {
        OR: [{ user1Id: userId }, { user2Id: userId }],
        status: { not: "ENDED" },
      },
    })
    if (!row) return null
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
