import { Router } from "express"

import { MatchingPreferenceGetController } from "../controller/matching-preference/get"
import { MatchingPreferenceUpdateController } from "../controller/matching-preference/update"

type MatchingPreferenceRouterControllers = {
  get?: MatchingPreferenceGetController
  update?: MatchingPreferenceUpdateController
}

/**
 * マッチングフィルタ関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const matchingPreferenceRouter = (
  controllers: MatchingPreferenceRouterControllers
): Router => {
  const router = Router()

  // GET /api/matching/preferences
  if (controllers.get) {
    const controller = controllers.get
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  // PUT /api/matching/preferences
  if (controllers.update) {
    const controller = controllers.update
    router.put("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
