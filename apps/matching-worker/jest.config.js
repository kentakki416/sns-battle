/**
 * apps/api の jest.config.js を参考に matching-worker 用に最小化したもの。
 * worker は SSE / supertest を使わないため testTimeout を長め（BullMQ delayed job の
 * 取り回しで実時間を待つテストがあり得るため）にしておく。
 */
process.env.LOGGER_TYPE = process.env.LOGGER_TYPE || "silent"

module.exports = {
  preset: "ts-jest",
  /**
   * tsconfig が module=node16 のときに ts-jest が出す TS151002 警告を抑制（apps/api と同じ理由）。
   * isolatedModules を有効化すると Prisma 7 の動的 import が壊れるため、警告のみ無視する。
   */
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: { ignoreCodes: [151002] } }],
  },
  testEnvironment: "node",
  roots: ["<rootDir>/test"],
  testMatch: ["<rootDir>/test/**/*.test.ts"],
  moduleFileExtensions: ["ts", "js", "json"],
  /**
   * api 側と同じく、Prisma v7 generated client の `.js` 拡張子付き相対 import を ts ファイルに
   * フォールバックさせるためのマッパー。worker は api の generated/client を相対 import で
   * 共有するためここでも同じマッピングが必要。
   */
  moduleNameMapper: {
    "^(\\..*)\\.js$": "$1",
  },
  testTimeout: 10000,
  /**
   * 実 Postgres / 実 Redis / 実 BullMQ を使うジョブテストはテーブル truncate と Redis flushdb の
   * 競合を避けるため直列実行する。api と同じ方針。
   */
  maxWorkers: 1,
}
