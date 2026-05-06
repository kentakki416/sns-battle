import { type IGoogleOAuthClient, GoogleUserInfo } from "../client/google-oauth"
import { logger } from "../log"
import {
  AuthAccountRepository,
  UserRegistrationRepository,
} from "../repository/prisma"
import { RefreshTokenRepository } from "../repository/redis"
import { User } from "../types/domain"
import { ok, Result } from "../types/result"

export type AuthenticateWithGoogleSuccess = {
    accessToken: string
    isNewUser: boolean
    refreshToken: string
    user: User
}

type Repositories = {
    authAccountRepository: AuthAccountRepository
    refreshTokenRepository: RefreshTokenRepository
    userRegistrationRepository: UserRegistrationRepository
}

type TokenGenerators = {
    generateAccessToken: (userId: number) => string
    generateRefreshToken: (userId: number) => { jti: string; token: string }
}

const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 7

/**
 * Google アカウントでの認証
 *
 * Next.js 側で取得した Authorization Code を Google で検証し、UserInfo を取得する。
 * 既存ユーザーが居なければ User + AuthAccount を作成し、Access/Refresh Token を発行する。
 *
 * 業務エラー（現状なし）は Result.err として返し、外部サービス障害などの予期しないエラーは throw する。
 */
export const authenticateWithGoogle = async (
  input: { code: string; redirectUri: string },
  repository: Repositories,
  googleAuthClient: IGoogleOAuthClient,
  tokenGenerators: TokenGenerators
): Promise<Result<AuthenticateWithGoogleSuccess>> => {
  logger.info("AuthService: Starting Google authentication")

  const googleUser: GoogleUserInfo = await googleAuthClient.getUserInfo(input.code, input.redirectUri)
  logger.debug("AuthService: Retrieved Google user info", {
    email: googleUser.email,
    googleId: googleUser.id,
  })

  const existingAccount = await repository.authAccountRepository.findByProvider("google", googleUser.id)

  let user: User
  let isNewUser = false

  if (existingAccount) {
    logger.info("AuthService: Existing user found", { userId: existingAccount.user.id })
    user = existingAccount.user
  } else {
    isNewUser = true
    logger.info("AuthService: Creating new user")
    user = await repository.userRegistrationRepository.createUserWithAuthAccountTx({
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
    logger.info("AuthService: New user created", { userId: user.id })
  }

  const accessToken = tokenGenerators.generateAccessToken(user.id)
  const { jti, token: refreshToken } = tokenGenerators.generateRefreshToken(user.id)
  await repository.refreshTokenRepository.save(jti, user.id, REFRESH_TTL_SECONDS)

  logger.debug("AuthService: Tokens issued", { userId: user.id })

  return ok({
    accessToken,
    isNewUser,
    refreshToken,
    user,
  })
}
