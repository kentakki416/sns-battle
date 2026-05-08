import { Router } from "express"

import { HobbyListController } from "../controller/hobby/list"

type HobbyRouterControllers = {
  list?: HobbyListController
}

/**
 * 趣味マスター関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const hobbyRouter = (controllers: HobbyRouterControllers): Router => {
  const router = Router()

  // GET /api/hobbies
  if (controllers.list) {
    const controller = controllers.list
    router.get("/", async (req, res) => controller.execute(req, res))
  }

  return router
}
