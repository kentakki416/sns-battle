import { type IGoogleOAuthClient, GoogleUserInfo } from "../client/google-oauth"
import { logger } from "../log"
import {
  AuthAccountRepository,
  UserRegistrationRepository,
} from "../repository/prisma"
import { User } from "../types/domain"
import { ok, Result } from "../types/result"

export type AuthenticateWithGoogleSuccess = {
    isNewUser: boolean
    jwtToken: string
    user: User
}

/**
 * Googleアカウントでの認証
 * 業務エラー（現状なし）は Result.err として返し、外部サービス障害などの予期しないエラーは throw する
 */
export const authenticateWithGoogle = async (
  code: string,
  repository: {
        authAccountRepository: AuthAccountRepository
        userRegistrationRepository: UserRegistrationRepository
    },
  googleAuthClient: IGoogleOAuthClient,
  tokenGenerator: (userId: number) => string
): Promise<Result<AuthenticateWithGoogleSuccess>> => {
  const { authAccountRepository, userRegistrationRepository } = repository

  logger.info("AuthService: Starting Google authentication")

  // Googleからユーザー情報を取得
  const googleUser: GoogleUserInfo = await googleAuthClient.getUserInfo(code)
  logger.debug("AuthService: Retrieved Google user info", {
    email: googleUser.email,
    googleId: googleUser.id,
  })

  // 既存アカウントを取得
  const existingAccount = await authAccountRepository.findByProvider("google", googleUser.id)

  let user: User
  let isNewUser = false

  if (existingAccount) {
    logger.info("AuthService: Existing user found", {
      userId: existingAccount.user.id,
    })
    user = existingAccount.user
  } else {
    isNewUser = true
    logger.info("AuthService: Creating new user")

    // 新規ユーザーとアカウントを作成
    user = await userRegistrationRepository.createUserWithAuthAccountTx({
      authAccount: {
        provider: "google",
        providerAccountId: googleUser.id,
      },
      user: {
        avatarUrl: googleUser.picture,
        email: googleUser.email,
        name: googleUser.name,
      },
    })
    logger.info("AuthService: New user created", {
      userId: user.id,
    })
  }

  // JWTトークンの生成
  const jwtToken = tokenGenerator(user.id)
  logger.debug("AuthService: JWT token generated", {
    userId: user.id,
  })

  return ok({
    isNewUser,
    jwtToken,
    user,
  })
}
