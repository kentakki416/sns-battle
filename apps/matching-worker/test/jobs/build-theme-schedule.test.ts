import { buildThemeSchedule } from "../../src/jobs/build-theme-schedule"
import type { TalkThemeRepository } from "../../src/repository/prisma"
import type { TalkTheme } from "../../src/types/domain"

/**
 * `findActiveByCategoryAndType` の戻り値だけを返すスタブ。本ファイルでは
 * `findByIdWithChoices` は呼ばれないので未実装にしておく。
 */
const buildStub = (themes: TalkTheme[]): TalkThemeRepository => ({
  findActiveByCategoryAndType: jest.fn(async (_category, type) =>
    themes.filter((t) => t.type === type),
  ),
  findByIdWithChoices: jest.fn(async () => null),
})

const makeTheme = (
  overrides: Partial<TalkTheme> & Pick<TalkTheme, "id" | "type">,
): TalkTheme => ({
  category: "MATCHING",
  duration: 20,
  isActive: true,
  sortOrder: 0,
  targetScoreMax: null,
  targetScoreMin: null,
  title: `theme-${overrides.id}`,
  ...overrides,
})

describe("buildThemeSchedule", () => {
  it("【既存挙動】mbtiCompatibility=null のとき全テーマプールから選ばれる", async () => {
    const themes: TalkTheme[] = [
      makeTheme({ id: 1, type: "FREE_TALK" }),
      makeTheme({ id: 2, type: "FREE_TALK", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 3, type: "FREE_TALK", targetScoreMax: 100, targetScoreMin: 85 }),
      makeTheme({ id: 11, type: "CHOICE" }),
      makeTheme({ id: 12, type: "CHOICE", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 13, type: "CHOICE", targetScoreMax: 100, targetScoreMin: 85 }),
    ]
    const schedule = await buildThemeSchedule(
      { talkThemeRepository: buildStub(themes) },
      { mbtiCompatibility: null },
    )

    expect(schedule).toHaveLength(10)
    const allowedFree = new Set([1, 2, 3])
    const allowedChoice = new Set([11, 12, 13])
    schedule.forEach((entry, i) => {
      if (i % 2 === 0) expect(allowedFree.has(entry.themeId)).toBe(true)
      else expect(allowedChoice.has(entry.themeId)).toBe(true)
    })
  })

  it("【LOW 帯】score=60 のとき LOW 帯または全帯域 OK のテーマだけが選ばれる", async () => {
    const themes: TalkTheme[] = [
      makeTheme({ id: 1, type: "FREE_TALK" }),
      makeTheme({ id: 2, type: "FREE_TALK", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 3, type: "FREE_TALK", targetScoreMax: 100, targetScoreMin: 85 }),
      makeTheme({ id: 11, type: "CHOICE" }),
      makeTheme({ id: 12, type: "CHOICE", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 13, type: "CHOICE", targetScoreMax: 100, targetScoreMin: 85 }),
    ]
    const schedule = await buildThemeSchedule(
      { talkThemeRepository: buildStub(themes) },
      { mbtiCompatibility: 60 },
    )

    /** id=3, id=13（HIGH 帯）は score=60 を満たさないので除外される */
    const allowedFree = new Set([1, 2])
    const allowedChoice = new Set([11, 12])
    schedule.forEach((entry, i) => {
      if (i % 2 === 0) expect(allowedFree.has(entry.themeId)).toBe(true)
      else expect(allowedChoice.has(entry.themeId)).toBe(true)
    })
  })

  it("【HIGH 帯】score=90 のとき HIGH 帯または全帯域 OK のテーマだけが選ばれる", async () => {
    const themes: TalkTheme[] = [
      makeTheme({ id: 1, type: "FREE_TALK" }),
      makeTheme({ id: 2, type: "FREE_TALK", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 3, type: "FREE_TALK", targetScoreMax: 100, targetScoreMin: 85 }),
      makeTheme({ id: 11, type: "CHOICE" }),
      makeTheme({ id: 12, type: "CHOICE", targetScoreMax: 69, targetScoreMin: 0 }),
      makeTheme({ id: 13, type: "CHOICE", targetScoreMax: 100, targetScoreMin: 85 }),
    ]
    const schedule = await buildThemeSchedule(
      { talkThemeRepository: buildStub(themes) },
      { mbtiCompatibility: 90 },
    )

    const allowedFree = new Set([1, 3])
    const allowedChoice = new Set([11, 13])
    schedule.forEach((entry, i) => {
      if (i % 2 === 0) expect(allowedFree.has(entry.themeId)).toBe(true)
      else expect(allowedChoice.has(entry.themeId)).toBe(true)
    })
  })

  it("【フォールバック】該当帯のテーマが片方の type に 1 件も無いとき全帯域プールで補う", async () => {
    /** FREE_TALK 側は HIGH 帯のみ。CHOICE 側に HIGH 帯は無く全帯域 OK のみ。 */
    const themes: TalkTheme[] = [
      makeTheme({ id: 3, type: "FREE_TALK", targetScoreMax: 100, targetScoreMin: 85 }),
      makeTheme({ id: 11, type: "CHOICE" }),
      makeTheme({ id: 12, type: "CHOICE", targetScoreMax: 69, targetScoreMin: 0 }),
    ]
    const schedule = await buildThemeSchedule(
      { talkThemeRepository: buildStub(themes) },
      { mbtiCompatibility: 90 },
    )

    schedule.forEach((entry, i) => {
      if (i % 2 === 0) {
        expect(entry.themeId).toBe(3)
      } else {
        /** CHOICE 側は HIGH 帯該当が無いので全帯域プール（id=11, 12）で補う */
        expect([11, 12]).toContain(entry.themeId)
      }
    })
  })

  it("【エラー】片方の type にテーマが 1 件も無いと throw", async () => {
    const themes: TalkTheme[] = [makeTheme({ id: 1, type: "FREE_TALK" })]
    await expect(
      buildThemeSchedule(
        { talkThemeRepository: buildStub(themes) },
        { mbtiCompatibility: null },
      ),
    ).rejects.toThrow()
  })
})
