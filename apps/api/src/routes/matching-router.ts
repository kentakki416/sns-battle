import { Router } from "express"

import { MatchingEventsController } from "../controller/matching/events"
import { MatchingJoinController } from "../controller/matching/join"
import { MatchingLeaveController } from "../controller/matching/leave"
import { MatchingReactionSubmitController } from "../controller/matching/reaction-submit"
import { MatchingReactionsListController } from "../controller/matching/reactions-list"
import { MatchingSessionDetailController } from "../controller/matching/session-detail"
import { MatchingSessionEndController } from "../controller/matching/session-end"
import { MatchingStatusController } from "../controller/matching/status"
import { MatchingTokenController } from "../controller/matching/token"

type MatchingRouterControllers = {
  events?: MatchingEventsController
  join?: MatchingJoinController
  leave?: MatchingLeaveController
  reactionSubmit?: MatchingReactionSubmitController
  reactionsList?: MatchingReactionsListController
  sessionDetail?: MatchingSessionDetailController
  sessionEnd?: MatchingSessionEndController
  status?: MatchingStatusController
  token?: MatchingTokenController
}

/**
 * マッチング関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const matchingRouter = (controllers: MatchingRouterControllers): Router => {
  const router = Router()

  // POST /api/matching/join
  if (controllers.join) {
    const controller = controllers.join
    router.post("/join", async (req, res) => controller.execute(req, res))
  }

  // DELETE /api/matching/leave
  if (controllers.leave) {
    const controller = controllers.leave
    router.delete("/leave", async (req, res) => controller.execute(req, res))
  }

  // GET /api/matching/status
  if (controllers.status) {
    const controller = controllers.status
    router.get("/status", async (req, res) => controller.execute(req, res))
  }

  // GET /api/matching/events (SSE)
  if (controllers.events) {
    const controller = controllers.events
    router.get("/events", async (req, res) => controller.execute(req, res))
  }

  // POST /api/matching/token
  if (controllers.token) {
    const controller = controllers.token
    router.post("/token", async (req, res) => controller.execute(req, res))
  }

  // POST /api/matching/sessions/:id/end
  // /:id 系より先に登録（Express は宣言順）
  if (controllers.sessionEnd) {
    const controller = controllers.sessionEnd
    router.post("/sessions/:id/end", async (req, res) => controller.execute(req, res))
  }

  // POST /api/matching/sessions/:id/reaction
  if (controllers.reactionSubmit) {
    const controller = controllers.reactionSubmit
    router.post("/sessions/:id/reaction", async (req, res) => controller.execute(req, res))
  }

  // GET /api/matching/sessions/:id/reactions
  if (controllers.reactionsList) {
    const controller = controllers.reactionsList
    router.get("/sessions/:id/reactions", async (req, res) => controller.execute(req, res))
  }

  // GET /api/matching/sessions/:id
  if (controllers.sessionDetail) {
    const controller = controllers.sessionDetail
    router.get("/sessions/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
