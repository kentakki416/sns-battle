import { Request, Response } from "express"

import { IGoogleOAuthClient } from "../../client/google-oauth"
import { logger } from "../../log"

/**
 * Google OAuth 認証を開始（Googleの認証画面にリダイレクト）API
 * エラー（OAuth クライアント設定エラー等）はグローバルエラーハンドラが 500 で返す
 */
export class AuthGoogleController {
  constructor(private googleOAuthClient: IGoogleOAuthClient) {}

  execute(_req: Request, res: Response) {
    logger.info("AuthGoogleController: Redirecting to Google OAuth")
    const authUrl = this.googleOAuthClient.generateAuthUrl()
    res.redirect(authUrl)
  }
}
