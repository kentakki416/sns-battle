import cors from "cors"
import express from "express"

import { createThemeProgressQueue, createWebhookEventsQueue } from "@repo/queue"

import { GoogleOAuthClient } from "./client/google-oauth"
import { LiveKitClient, LiveKitWebhookReceiverImpl } from "./client/livekit"
import { queueRedis, redis, redisSubscriber } from "./client/redis"
import { AuthGoogleController } from "./controller/auth/google"
import { AuthLogoutController } from "./controller/auth/logout"
import { AuthMeController } from "./controller/auth/me"
import { AuthRefreshController } from "./controller/auth/refresh"
import { HealthLivenessController } from "./controller/health/liveness"
import { HealthReadinessController } from "./controller/health/readiness"
import { HobbyListController } from "./controller/hobby/list"
import { MatchingEventsController } from "./controller/matching/events"
import { MatchingJoinController } from "./controller/matching/join"
import { MatchingLeaveController } from "./controller/matching/leave"
import { LiveKitWebhookController } from "./controller/matching/livekit-webhook"
import { MatchingReactionSubmitController } from "./controller/matching/reaction-submit"
import { MatchingReactionsListController } from "./controller/matching/reactions-list"
import { MatchingSessionDetailController } from "./controller/matching/session-detail"
import { MatchingSessionEndController } from "./controller/matching/session-end"
import { MatchingSessionStartController } from "./controller/matching/session-start"
import { MatchingStampController } from "./controller/matching/stamp"
import { MatchingStatusController } from "./controller/matching/status"
import { MatchingTokenController } from "./controller/matching/token"
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
  PrismaBlockRepository,
  PrismaDatabaseHealthRepository,
  PrismaHobbyRepository,
  PrismaItemRepository,
  PrismaMatchingPreferenceRepository,
  PrismaMatchingQueueRepository,
  PrismaMatchingReactionRepository,
  PrismaMatchingSessionRepository,
  PrismaMemoRepository,
  PrismaTalkThemeRepository,
  PrismaTransactionRunner,
  PrismaUserInventoryRepository,
  PrismaUserRepository,
} from "./repository/prisma"
import { BullMQThemeProgressEnqueuer } from "./repository/queue"
import {
  IoRedisHealthRepository,
  IoRedisMatchingEventPublisher,
  IoRedisMatchingEventSubscriber,
  IoRedisMatchingQueueRepository,
  IoRedisRateLimitRepository,
  IoRedisRefreshTokenRepository,
} from "./repository/redis"
import { authRouter } from "./routes/auth-router"
import { healthRouter } from "./routes/health-router"
import { hobbyRouter } from "./routes/hobby-router"
import { matchingPreferenceRouter } from "./routes/matching-preference-router"
import { matchingRouter } from "./routes/matching-router"
import { memoRouter } from "./routes/memo-router"
import { userRouter } from "./routes/user-router"

const app = express()
const PORT = process.env.PORT || 8080
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000"

// 環境変数（未設定の場合はダミー値で起動する。認証機能は動作しないがヘルスチェック等は応答可能）
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "dummy"
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "dummy"
const LIVEKIT_HOST = process.env.LIVEKIT_HOST || "https://dummy.livekit.cloud"
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || "dummy-key"
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || "dummy-secret"

// Repository のインスタンス化
const userRepository = new PrismaUserRepository(prisma)
const authAccountRepository = new PrismaAuthAccountRepository(prisma)
const transactionRunner = new PrismaTransactionRunner(prisma)
const memoRepository = new PrismaMemoRepository(prisma)
const hobbyRepository = new PrismaHobbyRepository(prisma)
const matchingPreferenceRepository = new PrismaMatchingPreferenceRepository(prisma)
const matchingQueueRepository = new PrismaMatchingQueueRepository(prisma)
const matchingSessionRepository = new PrismaMatchingSessionRepository(prisma)
const matchingReactionRepository = new PrismaMatchingReactionRepository(prisma)
const talkThemeRepository = new PrismaTalkThemeRepository(prisma)
const itemRepository = new PrismaItemRepository(prisma)
const userInventoryRepository = new PrismaUserInventoryRepository(prisma)
const blockRepository = new PrismaBlockRepository(prisma)
const databaseHealthRepository = new PrismaDatabaseHealthRepository(prisma)
const redisHealthRepository = new IoRedisHealthRepository(redis)
const refreshTokenRepository = new IoRedisRefreshTokenRepository(redis)
const matchingQueueRedisRepository = new IoRedisMatchingQueueRepository(redis)
const matchingEventPublisher = new IoRedisMatchingEventPublisher(redis)
const matchingEventSubscriber = new IoRedisMatchingEventSubscriber(redisSubscriber)
const rateLimitRedisRepository = new IoRedisRateLimitRepository(redis)

// Client のインスタンス化
const googleOAuthClient = new GoogleOAuthClient(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET)
const livekitClient = new LiveKitClient(LIVEKIT_HOST, LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
const livekitWebhookReceiver = new LiveKitWebhookReceiverImpl(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)

// BullMQ Queue（enqueue 専用）
const themeProgressQueue = createThemeProgressQueue(queueRedis)
const themeProgressEnqueuer = new BullMQThemeProgressEnqueuer(themeProgressQueue)
const webhookEventsQueue = createWebhookEventsQueue(queueRedis)

// Health Controller のインスタンス化
const healthLivenessController = new HealthLivenessController()
const healthReadinessController = new HealthReadinessController(databaseHealthRepository, redisHealthRepository)

// Auth Controller のインスタンス化
const authGoogleController = new AuthGoogleController(
  authAccountRepository,
  userRepository,
  refreshTokenRepository,
  transactionRunner,
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

// Matching Controller のインスタンス化
const matchingJoinController = new MatchingJoinController(
  blockRepository,
  matchingEventPublisher,
  matchingPreferenceRepository,
  matchingQueueRedisRepository,
  matchingQueueRepository,
  matchingSessionRepository,
  transactionRunner,
  userRepository,
)
const matchingLeaveController = new MatchingLeaveController(
  matchingQueueRedisRepository,
  matchingQueueRepository,
)
const matchingStatusController = new MatchingStatusController(
  matchingQueueRedisRepository,
  matchingSessionRepository,
)
const matchingEventsController = new MatchingEventsController(matchingEventSubscriber)
const matchingTokenController = new MatchingTokenController(
  livekitClient,
  LIVEKIT_HOST,
  matchingSessionRepository,
)
const matchingSessionDetailController = new MatchingSessionDetailController(
  matchingSessionRepository,
  userRepository,
)
const matchingSessionEndController = new MatchingSessionEndController(matchingSessionRepository)
const matchingSessionStartController = new MatchingSessionStartController(
  matchingSessionRepository,
  themeProgressEnqueuer,
)
const matchingReactionSubmitController = new MatchingReactionSubmitController(
  livekitClient,
  matchingReactionRepository,
  matchingSessionRepository,
  talkThemeRepository,
)
const matchingReactionsListController = new MatchingReactionsListController(
  matchingReactionRepository,
  matchingSessionRepository,
)
const matchingStampController = new MatchingStampController(
  itemRepository,
  livekitClient,
  matchingSessionRepository,
  rateLimitRedisRepository,
  userInventoryRepository,
)
const livekitWebhookController = new LiveKitWebhookController(
  livekitWebhookReceiver,
  webhookEventsQueue,
)

// cors設定のミドルウェア
app.use(
  cors({
    credentials: true,
    origin: FRONTEND_URL,
  })
)

/**
 * jsonを変換するミドルウェア
 * LiveKit Webhook ルートのみは raw body で署名検証する必要があるため、
 * 該当パスでは express.json() をスキップしてルーター側の express.raw() に委ねる。
 */
const jsonParser = express.json()
app.use((req, res, next) => {
  if (req.path === "/api/matching/livekit-webhook") return next()
  return jsonParser(req, res, next)
})

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
/**
 * /api/matching/preferences より後にマウントすることで、Express のルーティング順序的に
 * preferences のルーター内で未マッチの場合のみ /api/matching の他のパス（join/leave/status）が
 * 評価される。順序を逆にしないこと。
 */
app.use(
  "/api/matching",
  matchingRouter({
    events: matchingEventsController,
    join: matchingJoinController,
    leave: matchingLeaveController,
    livekitWebhook: livekitWebhookController,
    reactionSubmit: matchingReactionSubmitController,
    reactionsList: matchingReactionsListController,
    sessionDetail: matchingSessionDetailController,
    sessionEnd: matchingSessionEndController,
    sessionStart: matchingSessionStartController,
    stamp: matchingStampController,
    status: matchingStatusController,
    token: matchingTokenController,
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
  /**
   * BullMQ Queue は内部で queueRedis 接続を共有しているため、queueRedis.quit() の前に
   * close() してジョブ追加を停止しないと、quit 中に新規 enqueue が失敗で例外を投げる。
   */
  await Promise.all([themeProgressQueue.close(), webhookEventsQueue.close()])
  await Promise.all([
    prisma.$disconnect(),
    redis.quit(),
    queueRedis.quit(),
    redisSubscriber.quit(),
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
  logger.error("Unhandled rejection", reason as Error )
  process.exit(1)
})