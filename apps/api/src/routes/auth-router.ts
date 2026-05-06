import { Router } from "express"

import { AuthGoogleController } from "../controller/auth/google"
import { AuthMeController } from "../controller/auth/me"

type AuthRouterControllers = {
  google?: AuthGoogleController
  me?: AuthMeController
}

/**
 * 認証関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const authRouter = (controllers: AuthRouterControllers): Router => {
  const router = Router()

  /** POST /api/auth/google */
  if (controllers.google) {
    const controller = controllers.google
    router.post("/google", async (req, res) => controller.execute(req, res))
  }

  /** GET /api/auth/me（グローバルに authMiddleware が適用済み） */
  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  return router
}
