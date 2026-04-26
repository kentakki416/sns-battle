import cors from "cors"
import express from "express"

import { GoogleOAuthClient } from "./client/google-oauth"
import { redis } from "./client/redis"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthGoogleCallbackController } from "./controller/auth/google-callback"
import { AuthMeController } from "./controller/auth/me"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { MemoCreateController } from "./controller/memo/create"
import { MemoDeleteController } from "./controller/memo/delete"
import { MemoDetailController } from "./controller/memo/detail"
import { MemoListController } from "./controller/memo/list"
import { MemoUpdateController } from "./controller/memo/update"
import { logger } from "./log"
import { authMiddleware } from "./middleware/auth"
import { errorHandler } from "./middleware/error-handler"
import { requestLogger } from "./middleware/request-logger"
import { prisma } from "./prisma/prisma.client"
import {
  PrismaAuthAccountRepository,
  PrismaDatabaseHealthRepository,
  PrismaMemoRepository,
  PrismaUserRepository,
  PrismaUserRegistrationRepository
} from "./repository/prisma"
import { IoRedisHealthRepository } from "./repository/redis"
import { authRouter } from "./routes/auth-router"
import { healthRouter } from "./routes/health-router"
import { memoRouter } from "./routes/memo-router"

const app = express()
const PORT = process.env.PORT || 8080
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"

// 環境変数（未設定の場合はダミー値で起動する。認証機能は動作しないがヘルスチェック等は応答可能）
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy"
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "dummy"
const GOOGLE_CALLBACK_URL = process.env.GOOGLE_CALLBACK_URL || "http://localhost:8080/api/auth/google/callback"

// Repository のインスタンス化
const userRepository = new PrismaUserRepository(prisma)
const authAccountRepository = new PrismaAuthAccountRepository(prisma)
const userRegistrationRepository = new PrismaUserRegistrationRepository(prisma)
const memoRepository = new PrismaMemoRepository(prisma)
const databaseHealthRepository = new PrismaDatabaseHealthRepository(prisma)
const redisHealthRepository = new IoRedisHealthRepository(redis)

// Client のインスタンス化
const googleOAuthClient = new GoogleOAuthClient(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_CALLBACK_URL
)

// Health Controller のインスタンス化
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

// Auth Controller のインスタンス化
const authGoogleController = new AuthGoogleController(googleOAuthClient)
const authGoogleCallbackController = new AuthGoogleCallbackController(
  authAccountRepository,
  userRegistrationRepository,
  googleOAuthClient,
)
const authMeController = new AuthMeController(userRepository)

// Memo Controller のインスタンス化
const memoListController = new MemoListController(memoRepository)
const memoDetailController = new MemoDetailController(memoRepository)
const memoCreateController = new MemoCreateController(memoRepository)
const memoUpdateController = new MemoUpdateController(memoRepository)
const memoDeleteController = new MemoDeleteController(memoRepository)

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
    callback: authGoogleCallbackController,
    google: authGoogleController,
    me: authMeController,
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