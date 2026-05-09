import { Queue } from "bullmq"
import type { Redis } from "ioredis"

export const THEME_PROGRESS_QUEUE_NAME = "theme-progress"

export type AdvanceThemeJob = {
  type: "advance-theme"
  sessionId: number
  /** 次に進めるラウンド番号（1〜10） */
  nextRoundNumber: number
}

export type PublishTimerJob = {
  type: "publish-timer"
  sessionId: number
  /** 30 秒ごとの tick index（0, 1, 2, ...） */
  tickIndex: number
}

export type SessionTimeoutJob = {
  type: "session-timeout"
  sessionId: number
}

export type ThemeProgressJob = AdvanceThemeJob | PublishTimerJob | SessionTimeoutJob

export const createThemeProgressQueue = (redis: Redis): Queue<ThemeProgressJob> =>
  new Queue<ThemeProgressJob>(THEME_PROGRESS_QUEUE_NAME, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 5000, type: "exponential" },
      removeOnComplete: { age: 3600, count: 1000 },
      removeOnFail: { age: 86400 },
    },
  })

/** 決定的 jobId で重複 enqueue を防ぐ */
export const buildAdvanceThemeJobId = (sessionId: number, nextRoundNumber: number): string => { return `session:${sessionId}:advance:${nextRoundNumber}` }
export const buildPublishTimerJobId = (sessionId: number, tickIndex: number): string => { return `session:${sessionId}:timer:${tickIndex}` }
export const buildSessionTimeoutJobId = (sessionId: number): string => { return `session:${sessionId}:timeout` }