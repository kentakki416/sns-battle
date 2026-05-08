import cors from "cors"
import express from "express"

import { GoogleOAuthClient } from "./client/google-oauth"
import { redis } from "./client/redis"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthMeController } from "./controller/auth/me"
import { AuthRefreshController } from "./controller/auth/refresh"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { HobbyListController } from "./controller/hobby/list"
import { MatchingPreferenceGetController } from "./controller/matching-preference/get"
import { MatchingPreferenceUpdateController } from "./controller/matching-preference/update"
import { MemoCreateController } from "./controller/memo/create"
import { MemoDeleteController } from "./controller/memo/delete"
import { MemoDetailController } from "./controller/memo/detail"
import { MemoListController } from "./controller/memo/list"
import { MemoUpdateController } from "./controller/memo/update"
import { UserGetController } from "./controller/user/get"
import { UserOnboardingController } from "./controller/user/onboarding"
import { UserUpdateController } from "./controller/user/update"
import { logger } from "./log"
import { authMiddleware } from "./middleware/auth"
import { errorHandler } from "./middleware/error-handler"
import { requestLogger } from "./middleware/request-logger"
import { prisma } from "./prisma/prisma.client"
import {
  PrismaAuthAccountRepository,
  PrismaDatabaseHealthRepository,
  PrismaHobbyRepository,
  PrismaMatchingPreferenceRepository,
  PrismaMemoRepository,
  PrismaUserRepository,
  PrismaUserRegistrationRepository
} from "./repository/prisma"
import { IoRedisHealthRepository, IoRedisRefreshTokenRepository } from "./repository/redis"
import { authRouter } from "./routes/auth-router"
import { healthRouter } from "./routes/health-router"
import { hobbyRouter } from "./routes/hobby-router"
import { matchingPreferenceRouter } from "./routes/matching-preference-router"
import { memoRouter } from "./routes/memo-router"
import { userRouter } from "./routes/user-router"

const app = express()
const PORT = process.env.PORT || 8080
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"

// 環境変数（未設定の場合はダミー値で起動する。認証機能は動作しないがヘルスチェック等は応答可能）
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy"
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "dummy"

// Repository のインスタンス化
const userRepository = new PrismaUserRepository(prisma)
const authAccountRepository = new PrismaAuthAccountRepository(prisma)
const userRegistrationRepository = new PrismaUserRegistrationRepository(prisma)
const memoRepository = new PrismaMemoRepository(prisma)
const hobbyRepository = new PrismaHobbyRepository(prisma)
const matchingPreferenceRepository = new PrismaMatchingPreferenceRepository(prisma)
const databaseHealthRepository = new PrismaDatabaseHealthRepository(prisma)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)

// Client のインスタンス化
const googleOAuthClient = new GoogleOAuthClient(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)

// Health Controller のインスタンス化
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

// Auth Controller のインスタンス化
const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRegistrationRepository,
  refreshTokenRepository,
  googleOAuthClient,
)
const authMeController = new AuthMeController(userRepository)
const authRefreshController = new AuthRefreshController(refreshTokenRepository)
const authLogoutController = new AuthLogoutController(refreshTokenRepository)

// Memo Controller のインスタンス化
const memoListController = new MemoListController(memoRepository)
const memoDetailController = new MemoDetailController(memoRepository)
const memoCreateController = new MemoCreateController(memoRepository)
const memoUpdateController = new MemoUpdateController(memoRepository)
const memoDeleteController = new MemoDeleteController(memoRepository)

// User Controller のインスタンス化
const userGetController = new UserGetController(userRepository)
const userUpdateController = new UserUpdateController(userRepository, hobbyRepository)
const userOnboardingController = new UserOnboardingController(userRepository, hobbyRepository)

// Hobby Controller のインスタンス化
const hobbyListController = new HobbyListController(hobbyRepository)

// MatchingPreference Controller のインスタンス化
const matchingPreferenceGetController = new MatchingPreferenceGetController(
  matchingPreferenceRepository,
)
const matchingPreferenceUpdateController = new MatchingPreferenceUpdateController(
  matchingPreferenceRepository,
  hobbyRepository,
)

// cors設定のミドルウェア
app.use(
  cors({
    credentials: true,
    origin: FRONTEND_URL,
  })
)

// jsonを変換するミドルウェア
app.use(express.json())

// 認証ミドルウェア
app.use(authMiddleware)

// リクエストのロギングミドルウェア
app.use(requestLogger)

// ルーティング
app.use(
  "/api/health",
  healthRouter({
    liveness: healthLivenessController,
    readiness: healthReadinessController,
  })
)
app.use(
  "/api/auth",
  authRouter({
    google: authGoogleController,
    logout: authLogoutController,
    me: authMeController,
    refresh: authRefreshController,
  })
)
app.use(
  "/api/memo",
  memoRouter({
    create: memoCreateController,
    delete: memoDeleteController,
    detail: memoDetailController,
    list: memoListController,
    update: memoUpdateController,
  })
)
app.use(
  "/api/users",
  userRouter({
    get: userGetController,
    onboarding: userOnboardingController,
    update: userUpdateController,
  })
)
app.use(
  "/api/hobbies",
  hobbyRouter({
    list: hobbyListController,
  })
)
app.use(
  "/api/matching/preferences",
  matchingPreferenceRouter({
    get: matchingPreferenceGetController,
    update: matchingPreferenceUpdateController,
  })
)

// グローバルエラーハンドラ（ルーティング定義の最後に登録する必要がある）
app.use(errorHandler)

// サーバー起動
app.listen(PORT, () => {
  logger.info("API server running", {
    environment: process.env.NODE_ENV || "development",
    port: PORT,
    url: `http://localhost:${PORT}`,
  })
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM signal received: closing HTTP server")
  await Promise.all([
    prisma.$disconnect(),
    redis.quit(),
  ])
  logger.info("Database and Redis connections closed")
  process.exit(0)
})

// 予期しない例外をキャッチ（念のため）
process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", error)
  process.exit(1)
})

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled rejection",  reason as Error )
  process.exit(1)
})