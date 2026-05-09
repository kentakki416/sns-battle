# ==============================================================================
# Stage 1: base - pnpm をインストールしたベースイメージ
# ==============================================================================
FROM node:20-slim AS base

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

# ==============================================================================
# Stage 2: builder - 依存インストール & ビルド
# ==============================================================================
FROM base AS builder

WORKDIR /app

# モノレポ設定ファイルをコピー
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./

# 各パッケージの package.json をコピー
COPY apps/matching-worker/package.json ./apps/matching-worker/
COPY packages/queue/package.json ./packages/queue/

# 依存インストール
RUN pnpm install --frozen-lockfile

# 各パッケージのtsconfig.jsonをコピー
COPY packages/queue/tsconfig.json ./packages/queue/
COPY apps/matching-worker/tsconfig.json apps/matching-worker/tsconfig.build.json ./apps/matching-worker/

# ソースコードをコピー
COPY packages/queue/src/ ./packages/queue/src/
COPY apps/matching-worker/src/ ./apps/matching-worker/src/

# 共有 queue パッケージをビルド → matching-worker をビルド
RUN pnpm --filter @repo/queue build
RUN pnpm --filter matching-worker build

# 本番用依存のみを抽出
RUN pnpm deploy --filter matching-worker --prod /app/deploy

# ==============================================================================
# Stage 3: runner - 本番実行用の軽量イメージ
# ==============================================================================
FROM node:20-slim AS runner

# tini: Node.js を PID 1 で直接実行すると SIGTERM 等のシグナルを正しく処理できず、
# SIGKILLによる強制削除が起きてしまうため軽量 init プロセスとして tini を使用。
RUN apt-get update && apt-get install -y --no-install-recommends tini && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# deploy ステージから本番依存をコピー
COPY --chown=node:node --from=builder /app/deploy/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/deploy/package.json ./package.json

# ビルド済みコードをコピー
COPY --chown=node:node --from=builder /app/apps/matching-worker/dist ./dist

# matching-worker は ALB 配下に置かないため EXPOSE は不要
ENTRYPOINT ["/usr/bin/tini", "--"]

USER node

CMD ["node", "dist/index.js"]
