import { Router } from "express"

import { AuthGoogleController } from "../controller/auth/google"
import { AuthGoogleCallbackController } from "../controller/auth/google-callback"
import { AuthMeController } from "../controller/auth/me"

type AuthRouterControllers = {
  callback?: AuthGoogleCallbackController
  google?: AuthGoogleController
  me?: AuthMeController
}

/**
 * 認証関連のルーター
 * 渡されたコントローラーのルートのみ登録する
 */
export const authRouter = (controllers: AuthRouterControllers): Router => {
  const router = Router()

  // GET /api/auth/google
  if (controllers.google) {
    const controller = controllers.google
    router.get("/google", (req, res) => controller.execute(req, res))
  }

  // GET /api/auth/google/callback
  if (controllers.callback) {
    const controller = controllers.callback
    router.get("/google/callback", async (req, res) => controller.execute(req, res))
  }

  // GET /api/auth/me (グローバルにauthMiddlewareが適用済み)
  if (controllers.me) {
    const controller = controllers.me
    router.get("/me", async (req, res) => controller.execute(req, res))
  }

  return router
}
