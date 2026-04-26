import { Request, Response } from "express"

import {
  authGoogleCallbackPathParamSchema,
  authGoogleCallbackResponseSchema,
} from "@repo/api-schema"

import { IGoogleOAuthClient } from "../../client/google-oauth"
import { generateToken } from "../../lib/jwt"
import { logger } from "../../log"
import { AuthAccountRepository, UserRegistrationRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * Google からのコールバックを処理し、JWT を返すAPI
 * 成功時・失敗時ともにフロントエンドへリダイレクトする（JSON ではない特殊ケース）
 * そのため、ここで独自にリダイレクト先を分岐する
 */
export class AuthGoogleCallbackController {
  constructor(
    private authAccountRepository: AuthAccountRepository,
    private userRegistrationRepository: UserRegistrationRepository,
    private googleOAuthClient: IGoogleOAuthClient
  ) {}

  async execute(req: Request, res: Response) {
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000"

    try {
      logger.info("AuthGoogleCallbackController: Starting Google OAuth callback process")

      const { code } = authGoogleCallbackPathParamSchema.parse(req.query)

      const authResult = await service.auth.authenticateWithGoogle(
        code,
        {
          authAccountRepository: this.authAccountRepository,
          userRegistrationRepository: this.userRegistrationRepository,
        },
        this.googleOAuthClient,
        generateToken
      )

      /**
       * 業務エラー発生時もサインインページへリダイレクト（UX 上 JSON を返せないため）
       */
      if (!authResult.ok) {
        logger.warn("AuthGoogleCallbackController: Business error", {
          error: authResult.error,
        })
        const signinUrl = new URL("/signin", frontendUrl)
        signinUrl.searchParams.set("error", "auth_failed")
        return res.redirect(signinUrl.toString())
      }

      const { isNewUser, jwtToken, user } = authResult.value
      logger.info("AuthGoogleCallbackController: Authentication successful", {
        isNewUser,
        userId: user.id,
      })

      const response = authGoogleCallbackResponseSchema.parse({
        is_new_user: isNewUser,
        token: jwtToken,
        user: {
          avatar_url: user.avatarUrl,
          created_at: user.createdAt.toISOString(),
          email: user.email,
          id: user.id,
          name: user.name,
        },
      })

      const callbackUrl = new URL("/api/auth/callback", frontendUrl)
      callbackUrl.searchParams.set("token", response.token)
      callbackUrl.searchParams.set("user", JSON.stringify({
        avatar_url: response.user.avatar_url,
        email: response.user.email,
        id: response.user.id,
        name: response.user.name,
      }))

      res.redirect(callbackUrl.toString())
    } catch (error) {
      /**
       * バリデーションエラーや予期しないエラーも UX 上サインインページに戻す
       */
      logger.error(
        "AuthGoogleCallbackController: Authentication failed",
        error instanceof Error ? error : new Error("Unknown error")
      )
      const signinUrl = new URL("/signin", frontendUrl)
      signinUrl.searchParams.set("error", "auth_failed")
      res.redirect(signinUrl.toString())
    }
  }
}
