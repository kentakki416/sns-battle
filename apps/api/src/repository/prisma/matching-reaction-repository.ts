import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { MatchingReaction, TalkTheme, TalkThemeChoice } from "../../types/domain"

/**
 * matching_reactions の作成入力。choiceId は CHOICE テーマで必須、FREE_TALK では null。
 */
export type CreateMatchingReactionInput = {
    choiceId: number | null
    roundNumber: number
    sessionId: number
    themeId: number
    userId: number
}

/**
 * 結果画面 / submitReaction のレスポンス組立に使う、theme + choice JOIN 済みリアクション。
 * choice は theme.type=FREE_TALK や未選択時に null。
 */
export type MatchingReactionWithJoins = {
    choice: TalkThemeChoice | null
    reaction: MatchingReaction
    theme: TalkTheme
}

export interface MatchingReactionRepository {
    create(input: CreateMatchingReactionInput): Promise<MatchingReaction>
    /**
     * 同セッション同ラウンドの「自分以外」のリアクションを返す。
     * 未回答なら null。両者の同 round 一致判定で使う。
     */
    findOpponentInSameRound(
        input: { myUserId: number; roundNumber: number; sessionId: number },
    ): Promise<MatchingReactionWithJoins | null>
    /**
     * セッションに紐づく全リアクションを round_number 昇順で返す。
     * 結果画面（step12）で round ごとに自分と相手の choice を並べるのに使う。
     */
    findAllForSession(sessionId: number): Promise<MatchingReactionWithJoins[]>
}

type ReactionWithJoinsRow = PrismaTypes.MatchingReactionGetPayload<{
    include: { choice: true; theme: true }
}>

export class PrismaMatchingReactionRepository implements MatchingReactionRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async create(input: CreateMatchingReactionInput): Promise<MatchingReaction> {
    const row = await this._prisma.matchingReaction.create({
      data: {
        choiceId: input.choiceId,
        roundNumber: input.roundNumber,
        sessionId: input.sessionId,
        themeId: input.themeId,
        userId: input.userId,
      },
    })
    return this._toReaction(row)
  }

  async findOpponentInSameRound(input: {
        myUserId: number
        roundNumber: number
        sessionId: number
    }): Promise<MatchingReactionWithJoins | null> {
    const row = await this._prisma.matchingReaction.findFirst({
      include: { choice: true, theme: true },
      where: {
        roundNumber: input.roundNumber,
        sessionId: input.sessionId,
        userId: { not: input.myUserId },
      },
    })
    if (!row) return null
    return this._toJoined(row)
  }

  async findAllForSession(sessionId: number): Promise<MatchingReactionWithJoins[]> {
    const rows = await this._prisma.matchingReaction.findMany({
      include: { choice: true, theme: true },
      orderBy: [{ roundNumber: "asc" }, { id: "asc" }],
      where: { sessionId },
    })
    return rows.map((r) => this._toJoined(r))
  }

  private _toReaction(row: PrismaTypes.MatchingReactionGetPayload<{}>): MatchingReaction {
    return {
      choiceId: row.choiceId,
      createdAt: row.createdAt,
      id: row.id,
      roundNumber: row.roundNumber,
      sessionId: row.sessionId,
      themeId: row.themeId,
      userId: row.userId,
    }
  }

  private _toJoined(row: ReactionWithJoinsRow): MatchingReactionWithJoins {
    return {
      choice: row.choice
        ? {
          emoji: row.choice.emoji,
          id: row.choice.id,
          label: row.choice.label,
          sortOrder: row.choice.sortOrder,
          themeId: row.choice.themeId,
        }
        : null,
      reaction: this._toReaction(row),
      theme: {
        category: row.theme.category,
        duration: row.theme.duration,
        id: row.theme.id,
        isActive: row.theme.isActive,
        sortOrder: row.theme.sortOrder,
        title: row.theme.title,
        type: row.theme.type,
      },
    }
  }
}
