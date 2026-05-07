# step8-web-confetti-effect.md

`<ConfettiEffect>` を実装する。`canvas-confetti` ライブラリの薄いラッパーで、マッチングのリアクション一致時・バトル勝利時に紙吹雪を画面中央上部から散らす。

UI 仕様は `docs/spec/common/README.md` の [ConfettiEffect](./README.md#confettieffect紙吹雪) を参照。

## 対応内容

### 依存追加

```bash
cd apps/web && pnpm add canvas-confetti
cd apps/web && pnpm add -D @types/canvas-confetti
```

ルートの `pnpm-lock.yaml` も更新される。`@types/canvas-confetti` は型定義パッケージ。

### ファイル構成

```
apps/web/src/components/ui/
└── confetti-effect.tsx
```

### `confetti-effect.tsx`

`canvas-confetti` はサイドエフェクトでルートに canvas を生成する。SSR 環境ではエラーになるため `"use client"` 必須。

```typescript
"use client"

import confetti from "canvas-confetti"
import { useEffect } from "react"

const COLORS: ReadonlyArray<string> = [
  "#CBACF9", // primary（パープル）
  "#EC4899", // accent-pink
  "#FBBF24", // warning（ゴールド）
  "#0EA5E9", // cyan
]

type Props = {
  /**
   * トリガーが変化したタイミングで紙吹雪を再発火する。
   * 例: バトル勝者が確定したフレームの timestamp や勝者の userId 等。
   */
  trigger: number | string
}

export function ConfettiEffect({ trigger }: Props) {
  useEffect(() => {
    const duration = 3000
    const end = Date.now() + duration

    const tick = () => {
      confetti({
        colors: [...COLORS],
        origin: { x: Math.random(), y: 0 },
        particleCount: 100,
        spread: 70,
        startVelocity: 45,
      })
      if (Date.now() < end) {
        window.setTimeout(tick, 250)
      }
    }

    tick()
  }, [trigger])

  return null
}
```

設計メモ:
- `trigger` が変わるたびに `useEffect` が再実行され紙吹雪が出る
- `tick` を `setTimeout` で連鎖させることで 3 秒間にわたって複数回バーストする
- 1 回のバーストで 100 粒、合計 12 回程度（約 1200 粒）
- `origin.x` をランダム化して左右に散らす
- レンダリング自体は `null` を返す（DOM を持たない）

### バレルエクスポート

```typescript
export { ConfettiEffect } from "./confetti-effect"
export { CountdownOverlay } from "./countdown-overlay"
export { LiveBadge } from "./live-badge"
export { TimerBar } from "./timer-bar"
export { VideoChatOverlay } from "./video-chat-overlay"
export type { ChatMessage } from "./video-chat-overlay"
```

### 使用例（参考、実装は不要）

```typescript
"use client"

import { useState } from "react"

import { ConfettiEffect } from "@/components/ui"

export function ReactionMatch() {
  const [matchAt, setMatchAt] = useState<number | null>(null)

  return (
    <>
      {matchAt !== null && <ConfettiEffect trigger={matchAt} />}
      <button onClick={() => setMatchAt(Date.now())}>一致！</button>
    </>
  )
}
```

## 動作確認

### プレビューページ

`apps/web/src/app/dev/confetti/page.tsx` を作成。

```typescript
"use client"

import { useState } from "react"

import { ConfettiEffect } from "@/components/ui/confetti-effect"

export default function ConfettiPreviewPage() {
  const [trigger, setTrigger] = useState(0)

  return (
    <main className="flex min-h-screen items-center justify-center bg-dark-base">
      <button
        className="rounded-lg bg-primary-glow px-6 py-3 text-primary"
        onClick={() => setTrigger((prev) => prev + 1)}
        type="button"
      >
        紙吹雪を発射（{trigger}）
      </button>
      {trigger > 0 && <ConfettiEffect trigger={trigger} />}
    </main>
  )
}
```

### 動作確認項目

`pnpm dev` 後 `http://localhost:3000/dev/confetti`:

1. ボタンをクリック → 画面上部から紙吹雪が降ってくる
2. 4 色（パープル / ピンク / ゴールド / シアン）が混ざる
3. 約 3 秒間にわたって左右ランダムな位置からバーストが続く
4. 連打しても重ねがけで発射される（`trigger` が増えるたびに新しい 3 秒バースト）
5. 紙吹雪は重力で落下しフェードアウト

### SSR の確認

`/sign-in` のような Server Component から `ConfettiEffect` を import しないこと（その場合は呼び出し側に `"use client"` を付ける、または Client コンポーネント側で再 import する）。

`apps/web` で:

```bash
pnpm build
```

ビルドが通ること（`canvas-confetti` の DOM 依存がプリレンダー時に評価されない）。

### Lint

```bash
cd apps/web && pnpm lint
```

### 確認後のクリーンアップ

- `apps/web/src/app/dev/` 配下の全プレビューページを削除（step4 / step5 / step6 / step7 / step8）
- 削除後 `pnpm build` が通ること

### Phase 2 完了の最終チェック

すべての step（step1〜8）が完了した時点で、以下を行う。

1. `apps/web/src/components/ui/index.ts` のエクスポートが揃っている
2. `apps/web/src/components/layout/app-shell.tsx` が Navbar / Sidebar を正しく差し込んでいる
3. `pnpm dev` で `/`、`/sign-in`、`/battles`、`/matching/session` が AppShell のモード判定通りに表示される
4. todo.md の Phase 2 チェックボックスを全て `[x]` に更新
5. `docs/spec/README.md` の共通基盤ステータスを「完了」に変更

### 既知の未対応

- カスタムカラー / カスタム持続時間 / 出現位置の固定など、prop 拡張は将来対応
- パフォーマンス: 同時に多数発射すると低スペック端末で描画が重い。バトルの大量勝利演出時は要計測
