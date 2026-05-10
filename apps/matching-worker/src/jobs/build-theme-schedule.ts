import type { TalkThemeRepository } from "../repository/prisma"

/**
 * 1 セッションが回す 10 ラウンド分の進行スケジュール。`speakerUserKey` は VS レイアウトの
 * 左右割り当てで使う（`user1` が左、`user2` が右）。
 */
export type ScheduleEntry = {
    durationSeconds: number
    speakerUserKey: "user1" | "user2"
    themeId: number
}

const TOTAL_ROUNDS = 10

/**
 * Fisher-Yates ベースの簡易 shuffle。シード固定は不要（決定性は Redis 永続化で担保）。
 */
const shuffle = <T>(arr: T[]): T[] => {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/**
 * 10 ラウンド分のテーマスケジュールを構築する。
 *
 * - 偶数 round（0, 2, 4, ...）は FREE_TALK、奇数 round は CHOICE で交互に並べる
 *   spec1 の「FREE_TALK と CHOICE を交互に出す」想定
 * - 各カテゴリ内はシャッフル順で取り出し、テーマ数が足りない場合は modulo で循環参照する
 * - speakerUserKey は user1 / user2 を交互に振る（同じ topic で同じ人だけが話さないように）
 *
 * ジョブ消化時の `Math.random` ではなく、本関数で 1 度生成して Redis に保存する。
 * worker 再起動時も同じ schedule を使うことで、巻き戻しや重複なく進行を再開できる。
 */
export const buildThemeSchedule = async (
  deps: { talkThemeRepository: TalkThemeRepository },
): Promise<ScheduleEntry[]> => {
  const [choiceThemes, freeTalkThemes] = await Promise.all([
    deps.talkThemeRepository.findActiveByCategoryAndType("MATCHING", "CHOICE"),
    deps.talkThemeRepository.findActiveByCategoryAndType("MATCHING", "FREE_TALK"),
  ])
  if (choiceThemes.length === 0 || freeTalkThemes.length === 0) {
    throw new Error(
      `Cannot build theme schedule: choice=${choiceThemes.length}, free=${freeTalkThemes.length}`,
    )
  }

  const c = shuffle(choiceThemes)
  const f = shuffle(freeTalkThemes)

  const result: ScheduleEntry[] = []
  for (let i = 0; i < TOTAL_ROUNDS; i++) {
    const isFreeTalk = i % 2 === 0
    const theme = isFreeTalk ? f[i % f.length] : c[i % c.length]
    result.push({
      durationSeconds: theme.duration,
      speakerUserKey: i % 2 === 0 ? "user1" : "user2",
      themeId: theme.id,
    })
  }
  return result
}
