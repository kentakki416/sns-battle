import type { Queue } from "bullmq"
import type { Redis } from "ioredis"

import {
  type AdvanceThemeJob,
  buildAdvanceThemeJobId,
  type ThemeProgressJob,
} from "@repo/queue"

import type { ILiveKitDataPublisher } from "../client/livekit"
import { logger } from "../log"
import type { MatchingSessionRepository, TalkThemeRepository } from "../repository/prisma"

import { buildThemeSchedule, type ScheduleEntry } from "./build-theme-schedule"

const TOTAL_ROUNDS = 10
const DEFAULT_HYPE_DELAY_MS = 1500
const SCHEDULE_TTL_SECONDS = 1800

/**
 * 2 ラウンド目以降に matching:theme より先に流す煽りメッセージ候補。
 * spec の「盛り上げコメント」枠で、配列からランダムに 1 件選ぶ。
 */
const HYPE_COMMENTS = [
  "本当に相手の心つかめたか？",
  "いい感じ！",
  "盛り上がってきた！",
  "次のテーマで勝負！",
  "相性バッチリかも！？",
  "ドキドキの展開！",
  "ここからが本番！",
  "運命の出会いか！？",
] as const

const scheduleKey = (sessionId: number): string => `matching:schedule:${sessionId}`

type AdvanceThemeDeps = {
    /** 2 ラウンド目以降の hype → theme 配信間の待機時間。テストでは 0 を渡して即時化する */
    hypeDelayMs?: number
    livekitDataPublisher: ILiveKitDataPublisher
    matchingSessionRepository: MatchingSessionRepository
    redis: Redis
    talkThemeRepository: TalkThemeRepository
    themeProgressQueue: Queue<ThemeProgressJob>
}

/**
 * `advance-theme` ジョブの消化処理。
 *
 * 1. session ENDED → no-op（冪等）
 * 2. nextRoundNumber > 10 → no-op（最終ラウンド以降の余計なジョブを無視）
 * 3. Redis に schedule が無ければ `buildThemeSchedule` で生成して保存（TTL 1800 秒）
 * 4. nextRoundNumber 番目のテーマ詳細（choices 込み）を取得
 * 5. 2 ラウンド目以降は matching:hype 配信 → 1.5 秒待機（盛り上げ間）
 * 6. matching:theme を Data Channel に publish
 * 7. nextRoundNumber < 10 のときだけ次ラウンドの advance-theme を `delay=durationSeconds*1000`
 *    で再 enqueue（最終ラウンド後は session-timeout 側で終了する）
 *
 * jobId が決定的なので、ジョブ失敗 → リトライでも重複 publish にならない（同 round の
 * advance-theme は同 jobId で再投入が黙って捨てられる）。
 */
export const advanceTheme = async (
  data: AdvanceThemeJob,
  deps: AdvanceThemeDeps,
): Promise<void> => {
  const session = await deps.matchingSessionRepository.findById(data.sessionId)
  if (!session || session.status === "ENDED") {
    logger.debug(
      { round: data.nextRoundNumber, sessionId: data.sessionId },
      "[advance-theme] no-op (session not found or ended)",
    )
    return
  }
  if (data.nextRoundNumber > TOTAL_ROUNDS) {
    logger.debug(
      { round: data.nextRoundNumber, sessionId: data.sessionId },
      "[advance-theme] no-op (round overflow)",
    )
    return
  }

  /** Redis に schedule が無ければ生成し保存 */
  const key = scheduleKey(data.sessionId)
  const cached = await deps.redis.get(key)
  let schedule: ScheduleEntry[]
  if (cached) {
    schedule = JSON.parse(cached) as ScheduleEntry[]
  } else {
    schedule = await buildThemeSchedule({ talkThemeRepository: deps.talkThemeRepository })
    await deps.redis.set(key, JSON.stringify(schedule), "EX", SCHEDULE_TTL_SECONDS)
  }

  const round = schedule[data.nextRoundNumber - 1]
  const theme = await deps.talkThemeRepository.findByIdWithChoices(round.themeId)
  if (!theme) {
    /**
     * schedule に書かれた themeId が無効化された / 削除された場合の防御。
     * 本セッションは ENDED 化せず、進行を停止するだけにとどめる（手動運用で対応）。
     */
    logger.warn(
      { round: data.nextRoundNumber, sessionId: data.sessionId, themeId: round.themeId },
      "[advance-theme] theme not found, skipping",
    )
    return
  }

  /** 2 ラウンド目以降は hype を先に配信 */
  if (data.nextRoundNumber > 1) {
    const hype = HYPE_COMMENTS[Math.floor(Math.random() * HYPE_COMMENTS.length)]
    await deps.livekitDataPublisher.publishData({
      payload: { message: hype },
      roomName: session.livekitRoomName,
      topic: "matching:hype",
    })
    const hypeDelayMs = deps.hypeDelayMs ?? DEFAULT_HYPE_DELAY_MS
    if (hypeDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, hypeDelayMs))
    }
  }

  await deps.livekitDataPublisher.publishData({
    payload: {
      choices: theme.choices.map((c) => ({ emoji: c.emoji, id: c.id, label: c.label })),
      duration: round.durationSeconds,
      round_number: data.nextRoundNumber,
      speaker: round.speakerUserKey,
      theme_id: theme.theme.id,
      title: theme.theme.title,
      type: theme.theme.type,
    },
    roomName: session.livekitRoomName,
    topic: "matching:theme",
  })

  if (data.nextRoundNumber < TOTAL_ROUNDS) {
    const next = data.nextRoundNumber + 1
    await deps.themeProgressQueue.add(
      "advance-theme",
      { nextRoundNumber: next, sessionId: data.sessionId, type: "advance-theme" },
      {
        delay: round.durationSeconds * 1000,
        jobId: buildAdvanceThemeJobId(data.sessionId, next),
      },
    )
  }

  logger.info(
    { round: data.nextRoundNumber, sessionId: data.sessionId, themeId: theme.theme.id },
    "[advance-theme] processed",
  )
}
