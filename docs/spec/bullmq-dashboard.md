# BullMQ ローカルダッシュボード（Bull Board）

ローカル開発時に BullMQ のキュー / ジョブを GUI で可視化するための手順書。**`apps/api` / `apps/matching-worker` のコードに依存させず、`docker-compose.yaml` に独立コンテナを追加する方式**を採用する。

## 目次

- [背景](#背景)
- [採用する方式](#採用する方式)
- [docker-compose 追加内容](#docker-compose-追加内容)
- [起動手順](#起動手順)
- [ダッシュボードで何ができるか](#ダッシュボードで何ができるか)
- [運用上の注意](#運用上の注意)
- [代替案: standalone Node 起動スクリプト](#代替案-standalone-node-起動スクリプト)

---

## 背景

`apps/matching-worker` は BullMQ delayed job でテーマ進行 / セッションタイムアウト / Webhook 副作用処理を捌く（[マッチング機能設計書 - BullMQ ジョブ設計](./matching/README.md#bullmq-ジョブ設計) 参照）。開発中は以下を確認したいケースが頻出する:

- `advance-theme` の delayed job が想定どおりの時刻に発火するか
- 自己ループの再 enqueue で Job ID 重複が起きていないか（冪等性の検証）
- 失敗したジョブの payload・スタックトレース
- 手動で delayed job を即時実行（promote）して動作確認

ログだけで追うのは現実的でないため、可視化ツールを導入する。

## 採用する方式

[Bull Board](https://github.com/felixmosh/bull-board) を **`@bull-board/express` の依存として `apps/api` に組み込まず**、Docker Hub の community image `deadly0/bull-board` を `docker-compose.yaml` に追加して独立コンテナで起動する。

### この方式を選ぶ理由

| 観点 | コード組み込み（`@bull-board/express`） | docker-compose 別コンテナ（採用） |
|------|------------------------------------|-----------------------------|
| `apps/api` の依存追加 | あり（runtime / dev 両方） | なし |
| prod ビルドへの影響 | env gate を入れ忘れると公開リスク | そもそも prod イメージに含まれない |
| バージョン管理 | `package.json` で管理。BullMQ メジャー更新時に整合確認が必要 | image tag を pin するだけ |
| 起動の独立性 | api プロセス起動に依存 | Redis さえ生きていれば単独で起動・再起動可能 |
| 認証 | 自前で middleware を書く | image の `USER_LOGIN` / `USER_PASSWORD` env で Basic 認証 |

ローカル限定で開発体験のためのツールなので、コードベースに混入させない方針が望ましい。

## docker-compose 追加内容

`docker-compose.yaml` に以下のサービスを追加する想定。**実装時の参考であり、実際にこのファイルを書き換えるのは Bull Board を導入する PR で行う**。

```yaml
services:
  # ... 既存の postgres / redis / api ...

  # BullMQ Dashboard（local dev only）
  bull-board:
    image: deadly0/bull-board:latest
    container_name: sns-battle-bull-board
    restart: unless-stopped
    environment:
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: 0
      BULL_VERSION: BULLMQ
      BULL_PREFIX: bull
      # Basic 認証（local でも素のまま晒さない）
      USER_LOGIN: admin
      USER_PASSWORD: admin
    ports:
      - "3050:3000"
    depends_on:
      redis:
        condition: service_healthy
    networks:
      - app-network
```

ポイント:

- **キューは自動発見**: `deadly0/bull-board` は `BULL_PREFIX` にマッチする Redis キーをスキャンしてキューを検出する。`packages/queue` の `theme-progress` / `webhook-events` は両方ともカスタム prefix を設定していない（BullMQ デフォルト `bull`）ので、image のデフォルト `BULL_PREFIX=bull` でそのまま **自動で表示される**。明示的にキューを列挙する env は image 側に存在しない
- **`REDIS_HOST: redis`**: `app-network` 内のサービス名で Redis を解決する（host 側の `localhost:6379` ではないことに注意）
- **`BULL_VERSION: BULLMQ`**: BullMQ 対応にする必須 env。`BULL` を指定すると Bull v3 用の挙動になる
- **`ports: "3050:3000"`**: ホスト側 3050 番（apps/web の 3000、apps/admin の 3030 と衝突しない）。コンテナ側は image の listen ポート `3000` 固定
- **image tag**: `latest` だと再現性が悪いので、本格導入時は `deadly0/bull-board:3.x.x` のように pin する

サポートされる env 変数の完全な一覧（[Deadly0/bull-board-docker](https://github.com/Deadly0/bull-board-docker) より）:

| 変数 | 用途 | デフォルト |
|------|------|----------|
| `REDIS_HOST` | Redis 接続先ホスト | `localhost` |
| `REDIS_PORT` | Redis ポート | `6379` |
| `REDIS_DB` | Redis DB 番号 | `0` |
| `REDIS_PASSWORD` | Redis パスワード | なし |
| `REDIS_USE_TLS` | TLS 有効化 | `false` |
| `BULL_PREFIX` | キュー名プレフィックス（BullMQ の Redis キー prefix と一致させる） | `bull` |
| `BULL_VERSION` | `BULLMQ` / `BULL` | `BULLMQ` |
| `PROXY_PATH` | サブパス配信時のベース URL | 空文字 |
| `USER_LOGIN` | Basic 認証ユーザー名（`USER_PASSWORD` と両方設定で有効化） | 無効 |
| `USER_PASSWORD` | Basic 認証パスワード | 無効 |

## 起動手順

実装後の想定操作:

```bash
# 1. Redis を含む依存サービスを起動
docker compose up -d redis bull-board

# 2. apps/api と apps/matching-worker をホストから dev 起動
pnpm dev

# 3. ブラウザで開く
open http://localhost:3050
# Basic 認証: admin / admin
```

`apps/api` / `apps/matching-worker` は dotenvx で `.env.local` を復号して `REDIS_HOST=localhost:6379` で動くため、ホスト起動でもコンテナ起動でも **同じ Redis（docker-compose の redis service）** を参照することになる。

## ダッシュボードで何ができるか

| 機能 | 用途例 |
|------|------|
| キュー別カウンタ（active / waiting / delayed / completed / failed / paused） | `theme-progress` の delayed が想定本数（10 ラウンド分の advance + 20 本の timer）あるか |
| Job 一覧 + 詳細 | `session:42:advance:3` の payload・実行履歴・次の発火予定時刻を確認 |
| Job のログ・進捗・スタックトレース | `advance-theme` が throw した時のスタックを直接見る |
| 手動 retry / promote / clean / pause / resume | delayed job を `promote` で即実行して動作確認 |
| キュー全体のメトリクス（throughput・遅延ヒストグラム） | step8 のテーマ進行が滞留してないか |

開発中、特に **冪等性の検証**（同じ Job ID が二度 enqueue されたら ignore されるか）と **delayed job の発火タイミング検証**（30 秒 timer / `duration` 秒 advance）に強い。

## 運用上の注意

- **prod デプロイ対象外**。`docker-compose.yaml` はあくまで local dev 用で、Terraform / ECS のデプロイには含まれない。誤って ECS Task に含めないこと
- **Basic 認証の credentials は local 値**。`.env.local` に出すほどでもないが、外部に晒す環境（ngrok 経由で LiveKit Webhook を受けるとき等）では強めの値に変える
- **キュー追加時は何もしなくてよい**。`BULL_PREFIX=bull` でスキャンするため、`packages/queue` に新キュー（例: 将来の配信用 `streaming-events`）を追加してジョブが流れ始めた時点で自動的にダッシュボードに現れる。**ただしカスタム prefix を指定したキューを追加する場合は image の `BULL_PREFIX` を揃える必要がある**（複数 prefix を同時監視はできないため、揃えるのが現実的）
- **BullMQ メジャー更新時の整合**: `bullmq` を v5 → v6 等に上げる場合は `deadly0/bull-board` の image tag も対応バージョンを確認する。`@bull-board/api` のメジャー番号は BullMQ の breaking change にしばしば追従するため

## 代替案: standalone Node 起動スクリプト

community image を使わず、`@bull-board/express` を使った極小 Node 起動スクリプトを `tools/bull-board/` 配下に置いて `docker-compose` の `build:` で起動する案もある。

メリット:
- 認証 middleware を柔軟に書ける（IP 制限 / OAuth プロキシ等）
- キュー定義を `packages/queue` から直接 import できるため列挙ミスが起きない

デメリット:
- スクリプト実装と Dockerfile を維持する手間
- `pnpm install` が必要なので起動が遅い

**Spec1 では community image 案を推奨**。複雑な認証要件が出てきた段階で standalone 案に切り替える。
