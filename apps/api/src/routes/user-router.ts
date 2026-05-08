import { Router } from "express"

import { UserGetController } from "../controller/user/get"
import { UserOnboardingController } from "../controller/user/onboarding"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  get?: UserGetController
  onboarding?: UserOnboardingController
  update?: UserUpdateController
}

/**
 * ユーザー関連のルーター
 * 渡されたコントローラーのルートのみ登録する。
 * 長いパス（/:id/onboarding）を /:id より先に登録して Express のマッチを安定させる。
 */
export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  // PUT /api/users/:id/onboarding
  if (controllers.onboarding) {
    const controller = controllers.onboarding
    router.put("/:id/onboarding", async (req, res) => controller.execute(req, res))
  }

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
