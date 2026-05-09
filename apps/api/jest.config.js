// テスト実行時に必要な環境変数のデフォルト値を設定
process.env.LOGGER_TYPE = process.env.LOGGER_TYPE || "silent"
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "test-jwt-access-secret"
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-jwt-refresh-secret"
process.env.JWT_ACCESS_EXPIRATION = process.env.JWT_ACCESS_EXPIRATION || "15m"
process.env.JWT_REFRESH_EXPIRATION = process.env.JWT_REFRESH_EXPIRATION || "7d"

module.exports = {
  // ts-jest プリセットを使用。TypeScript ファイルを Jest が直接実行できるよう、
  // 内部で ts-jest トランスフォーマーが .ts → .js への変換を行う。
  preset: "ts-jest",

  /**
   * ts-jest の transform 設定。
   * TS151002: "Using hybrid module kind (Node16/18/Next) is only supported in isolatedModules: true"
   * tsconfig の module=node16 を維持するために出る警告だが、
   * isolatedModules を立てると ts-jest が per-file transpile に切り替わり、
   * Prisma v7 生成コードの動的 import が壊れて全テストが失敗するため警告を無視
   */
  transform: {
    "^.+\\.tsx?$": ["ts-jest", { diagnostics: { ignoreCodes: [151002] } }],
  },

  // テストの実行環境。"node" は Node.js 環境（サーバーサイド向け）。
  // フロントエンドの場合は "jsdom"（ブラウザ相当の DOM API が使える）を指定する。
  testEnvironment: "node",

  // テストファイルを探索するルートディレクトリ。
  roots: ["<rootDir>/test"],

  // テストファイルとして認識するファイルパターン。
  testMatch: ["<rootDir>/test/**/*.test.ts"],

  // モジュール解決時に認識する拡張子の優先順位。
  // import 文で拡張子を省略した場合、この順序でファイルを探す。
  moduleFileExtensions: ["ts", "js", "json"],

  // カバレッジ計測対象のファイルパターン。
  // ! で始まるパターンは除外対象（型定義ファイルやエントリポイントは除外）。
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/index.ts",
  ],

  // カバレッジレポートの出力先ディレクトリ。
  coverageDirectory: "coverage",

  // カバレッジレポートの出力形式。
  // text: ターミナルに表示、lcov: CI ツール連携用、html: ブラウザで閲覧用。
  coverageReporters: ["text", "lcov", "html"],

  // import パスの書き換えルール（正規表現 → 置換先）。
  // Jest がモジュールを require する前にパスを変換する。
  moduleNameMapper: {
    // tsconfig.json の paths で定義した @/ エイリアスを Jest でも解決できるようにする。
    "^@/(.*)$": "<rootDir>/src/$1",

    // Prisma v7 の generated client は moduleFormat="cjs" でも
    // ファイル内のインポートに .js 拡張子を付与する（例: import * from "./enums.js"）。
    // これは Node.js の ESM 規約に準拠した記法だが、
    // Jest は ts-jest プリセットで .ts ファイルを直接実行するため、
    // .js 拡張子のファイルを探しに行くと「Cannot find module './enums.js'」エラーになる。
    // このマッパーで .js 拡張子を除去し、Jest のモジュール解決で .ts ファイルにフォールバックさせる。
    "^(\\..*)\\.js$": "$1",
  },

  // 各テストケースのタイムアウト時間（ミリ秒）。
  testTimeout: 3000,

  // コントローラーテストが実DBに接続するため、
  // 複数テストファイルが並列実行されると同じテーブルの INSERT/DELETE が競合してテストが不安定になる。
  // maxWorkers: 1 で直列実行にすることで、テスト間のデータ競合を防ぐ。
  maxWorkers: 1,
}
