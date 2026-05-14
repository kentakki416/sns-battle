import { Prisma as PrismaTypes, PrismaClient } from "../../client/prisma"
import {
  TalkTheme,
  TalkThemeCategory,
  TalkThemeChoice,
  TalkThemeType,
  TalkThemeWithChoices,
} from "../../types/domain"

/**
 * worker 用 TalkThemeRepository。
 *
 * worker は `buildThemeSchedule` でテーマ一覧を取得し、ジョブ消化時に id 指定で詳細
 * （選択肢込み）を引く。書き込みは行わない。
 */
export interface TalkThemeRepository {
    /** 指定 category / type で is_active=true のテーマを sortOrder 昇順で返す */
    findActiveByCategoryAndType(
        category: TalkThemeCategory,
        type: TalkThemeType,
    ): Promise<TalkTheme[]>
    /** id でテーマと選択肢一式を取得。未存在なら null */
    findByIdWithChoices(id: number): Promise<TalkThemeWithChoices | null>
}

type ThemeWithChoicesRow = PrismaTypes.TalkThemeGetPayload<{ include: { choices: true } }>

export class PrismaTalkThemeRepository implements TalkThemeRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findActiveByCategoryAndType(
    category: TalkThemeCategory,
    type: TalkThemeType,
  ): Promise<TalkTheme[]> {
    const rows = await this._prisma.talkTheme.findMany({
      orderBy: { sortOrder: "asc" },
      where: { category, isActive: true, type },
    })
    return rows.map((r) => this._toTheme(r))
  }

  async findByIdWithChoices(id: number): Promise<TalkThemeWithChoices | null> {
    const row = await this._prisma.talkTheme.findUnique({
      include: { choices: { orderBy: { sortOrder: "asc" } } },
      where: { id },
    })
    if (!row) return null
    return {
      choices: row.choices.map((c) => this._toChoice(c)),
      theme: this._toTheme(row),
    }
  }

  private _toTheme(row: ThemeWithChoicesRow | PrismaTypes.TalkThemeGetPayload<{}>): TalkTheme {
    return {
      category: row.category,
      duration: row.duration,
      id: row.id,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
      targetScoreMax: row.targetScoreMax,
      targetScoreMin: row.targetScoreMin,
      title: row.title,
      type: row.type,
    }
  }

  private _toChoice(row: PrismaTypes.TalkThemeChoiceGetPayload<{}>): TalkThemeChoice {
    return {
      emoji: row.emoji,
      id: row.id,
      label: row.label,
      sortOrder: row.sortOrder,
      themeId: row.themeId,
    }
  }
}
