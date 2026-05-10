import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { TalkTheme, TalkThemeChoice, TalkThemeWithChoices } from "../../types/domain"

/**
 * トークテーマ（talk_themes）の Repository。
 *
 * Spec1 ではマスター読み込み専用なので create / update / delete は提供しない。
 * 後続 step（テーマ進行タイマー / 結果画面）で使う findById のみ実装する。
 */
export interface TalkThemeRepository {
    /** id でテーマと選択肢一式を取得。未存在なら null */
    findById(id: number): Promise<TalkThemeWithChoices | null>
}

type ThemeWithChoicesRow = PrismaTypes.TalkThemeGetPayload<{ include: { choices: true } }>

export class PrismaTalkThemeRepository implements TalkThemeRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(id: number): Promise<TalkThemeWithChoices | null> {
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

  private _toTheme(row: ThemeWithChoicesRow): TalkTheme {
    return {
      category: row.category,
      duration: row.duration,
      id: row.id,
      isActive: row.isActive,
      sortOrder: row.sortOrder,
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
