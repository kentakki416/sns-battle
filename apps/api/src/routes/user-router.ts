import { Router } from "express"

import { UserGetController } from "../controller/user/get"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  get?: UserGetController
  update?: UserUpdateController
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

  // PUT /api/users/:id
  if (controllers.update) {
    const controller = controllers.update
    router.put("/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
