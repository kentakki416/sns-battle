import { Router } from "express"

import { UserGetController } from "../controller/user/get"

type UserRouterControllers = {
  get?: UserGetController
}

/**
 * ユーザー関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  // GET /api/users/:id
  if (controllers.get) {
    const controller = controllers.get
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
