import { Response } from "express"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { MatchingEventSubscriber } from "../../repository/redis"
import * as service from "../../service"

/**
 * GET /api/matching/events (Server-Sent Events)
 *
 * クライアントは join 直前にこのエンドポイントへ接続を張り、Pub/Sub 経由で
 * `matched` / `heartbeat` / `cancelled` イベントを受け取る。接続を閉じると generator が
 * 中断され、Redis subscribe も解除される。
 */
export class MatchingEventsController {
  constructor(private matchingEventSubscriber: MatchingEventSubscriber) {}

  async execute(req: AuthRequest, res: Response) {
    logger.info("MatchingEventsController: subscribe", { userId: req.userId })

    res.setHeader("Content-Type", "text/event-stream")
    res.setHeader("Cache-Control", "no-cache")
    res.setHeader("Connection", "keep-alive")
    /** nginx 等のリバースプロキシでバッファリングを無効化する */
    res.setHeader("X-Accel-Buffering", "no")
    res.flushHeaders?.()

    const ac = new AbortController()
    /**
     * 接続切断時に generator を停止して subscribe 解除する。
     * `close` は client 側切断とサーバー側終了の両方で発火する。
     */
    req.on("close", () => ac.abort())

    try {
      for await (const ev of service.matching.subscribeMatchingEvents(
        req.userId!,
        ac.signal,
        { matchingEventSubscriber: this.matchingEventSubscriber },
      )) {
        res.write(`event: ${ev.type}\n`)
        res.write(`data: ${JSON.stringify(ev)}\n\n`)
      }
    } finally {
      if (!res.writableEnded) res.end()
    }
  }
}
