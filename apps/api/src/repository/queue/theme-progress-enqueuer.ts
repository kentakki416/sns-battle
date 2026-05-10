import type { Queue } from "bullmq"

import {
  buildAdvanceThemeJobId,
  buildPublishTimerJobId,
  buildSessionTimeoutJobId,
  type ThemeProgressJob,
} from "@repo/queue"

/**
 * セッション開始時にテーマ進行系ジョブをまとめて enqueue する Repository。
 *
 * BullMQ `Queue` をそのまま Service に渡すと `jest.fn()` で振る舞いを差し替えにくいため、
 * interface で抽象化し、本番では `BullMQThemeProgressEnqueuer` を、Service ユニットテストでは
 * `jest.fn()` ベースの mock を注入する。
 *
 * `enqueueSessionStart` は同 sessionId に対して何度呼び出されても、決定的 jobId（`@repo/queue` の
 * `buildAdvanceThemeJobId` / `buildPublishTimerJobId` / `buildSessionTimeoutJobId`）により
 * BullMQ 側で重複が黙って捨てられるため冪等。
 */
export interface ThemeProgressEnqueuer {
  /**
   * セッション開始ジョブ群を 3 件まとめて enqueue する。
   *
   * - `advance-theme(sessionId, nextRoundNumber=1)` を即時（delay=0）
   * - `publish-timer(sessionId, tickIndex=0)` を 30 秒後
   * - `session-timeout(sessionId)` を 10 分後
   */
  enqueueSessionStart: (sessionId: number) => Promise<void>
}

export class BullMQThemeProgressEnqueuer implements ThemeProgressEnqueuer {
  constructor(private readonly queue: Queue<ThemeProgressJob>) {}

  enqueueSessionStart = async (sessionId: number): Promise<void> => {
    await Promise.all([
      this.queue.add(
        "advance-theme",
        { nextRoundNumber: 1, sessionId, type: "advance-theme" },
        { delay: 0, jobId: buildAdvanceThemeJobId(sessionId, 1) },
      ),
      this.queue.add(
        "publish-timer",
        { sessionId, tickIndex: 0, type: "publish-timer" },
        { delay: 30_000, jobId: buildPublishTimerJobId(sessionId, 0) },
      ),
      this.queue.add(
        "session-timeout",
        { sessionId, type: "session-timeout" },
        { delay: 600_000, jobId: buildSessionTimeoutJobId(sessionId) },
      ),
    ])
  }
}
