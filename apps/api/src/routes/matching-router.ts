import { Router } from "express"

import { MatchingJoinController } from "../controller/matching/join"
import { MatchingLeaveController } from "../controller/matching/leave"
import { MatchingStatusController } from "../controller/matching/status"

type MatchingRouterControllers = {
  join?: MatchingJoinController
  leave?: MatchingLeaveController
  status?: MatchingStatusController
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

  return router
}
