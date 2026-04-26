/**
 * Logger の種類
 */
export const LOGGER_TYPE = {
  CONSOLE: "console",
  PINO: "pino",
  SILENT: "silent",
  WINSTON: "winston",
} as const

/**
 * LOGレベル
 */
export const LOG_LEVEL = {
  DEBUG: "debug",
  INFO: "info",
  WARN: "warn",
  ERROR: "error"
} as const

/**
 * Nodeの環境
 */
export const NODE_ENV = {
  DEV: "dev",
  PRD: "prd"
} as const

/**
 * 認証をスキップする公開パス
 * これらのパスではauthMiddlewareが認証チェックをスキップします
 */
export const PUBLIC_PATHS = [
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/health",
  "/api/memo",
] as const

/**
 * リクエストログを除外するパス
 * これらのパスではrequestLoggerがログを記録しません
 */
export const LOG_EXCLUDE_PATHS = [
  "/api/health",
  "/api/health/ready",
] as const