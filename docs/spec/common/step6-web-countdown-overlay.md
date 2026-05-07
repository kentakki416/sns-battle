# step6-web-countdown-overlay.md

`<CountdownOverlay>` を実装する。マッチング開始・バトル開始・配信開始の直前に「3 → 2 → 1 → START!」を全画面で 1 秒ごとに切り替えるオーバーレイ。

UI 仕様は `docs/spec/common/README.md` の [CountdownOverlay](./README.md#countdownoverlayマッチングバトル共通仕様) を参照。

完了時に親コンポーネントへ通知する `onComplete` コールバックを必ず受け取り、呼び出し側でオーバーレイのアンマウント / 次の状態への遷移を制御する。

## 対応内容

### ファイル構成

```
apps/web/src/components/ui/
└── countdown-overlay.tsx
```

依存ライブラリは `framer-motion`（既存）のみ。

### `countdown-overlay.tsx`

```typescript
"use client"

import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

const SEQUENCE: ReadonlyArray<string> = ["3", "2", "1", "START!"]

type Props = {
  onComplete: () => void
}

export function CountdownOverlay({ onComplete }: Props) {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (index >= SEQUENCE.length) {
      onComplete()
      return
    }
    const timer = window.setTimeout(() => setIndex((prev) => prev + 1), 1000)
    return () => window.clearTimeout(timer)
  }, [index, onComplete])

  if (index >= SEQUENCE.length) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,3,25,0.92)",
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          animate={{ opacity: 1, scale: 1 }}
          className="bg-clip-text text-[140px] font-bold leading-none text-transparent"
          exit={{ opacity: 0, scale: 1.5 }}
          initial={{ opacity: 0, scale: 0.3 }}
          key={SEQUENCE[index]}
          style={{
            backgroundImage:
              "linear-gradient(135deg, #CBACF9 0%, #0EA5E9 100%)",
            filter: "drop-shadow(0 0 60px rgba(203,172,249,0.4))",
          }}
          transition={{ duration: 0.3 }}
        >
          {SEQUENCE[index]}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
```

### バレルエクスポート

`apps/web/src/components/ui/index.ts` に追記（アルファベット順）。

```typescript
export { CountdownOverlay } from "./countdown-overlay"
export { LiveBadge } from "./live-badge"
export { VideoChatOverlay } from "./video-chat-overlay"
export type { ChatMessage } from "./video-chat-overlay"
```

### `onComplete` の挙動

- シーケンス: `["3", "2", "1", "START!"]` を 1 秒ずつ表示（合計 4 秒）
- 4 秒経過後、index が長さに達したタイミングで `onComplete()` を呼ぶ
- その後、コンポーネントは `null` を返す（親が条件付きレンダーで unmount してもよい）
- `onComplete` の参照が変わると `useEffect` が再実行されるため、**呼び出し側は `useCallback` でメモ化する**

### 使用例（参考、実装は不要）

```typescript
"use client"

import { useState } from "react"

import { CountdownOverlay } from "@/components/ui"

export function MatchingSession() {
  const [phase, setPhase] = useState<"countdown" | "active">("countdown")

  return (
    <>
      {phase === "countdown" && (
        <CountdownOverlay onComplete={() => setPhase("active")} />
      )}
      {phase === "active" && <div>...マッチング本編...</div>}
    </>
  )
}
```

## 動作確認

### プレビューページ

`apps/web/src/app/dev/countdown-overlay/page.tsx` を作って確認。完了後に削除。

```typescript
"use client"

import { useState } from "react"

import { CountdownOverlay } from "@/components/ui/countdown-overlay"

export default function CountdownOverlayPreviewPage() {
  const [showing, setShowing] = useState(false)

  return (
    <main className="flex min-h-screen items-center justify-center bg-dark-base">
      <button
        className="rounded-lg bg-primary-glow px-6 py-3 text-primary"
        onClick={() => setShowing(true)}
        type="button"
      >
        カウントダウン開始
      </button>
      {showing && <CountdownOverlay onComplete={() => setShowing(false)} />}
    </main>
  )
}
```

### 動作確認項目

`pnpm dev` 後 `http://localhost:3000/dev/countdown-overlay` で:

1. 「カウントダウン開始」ボタンをクリック → 画面全体がぼやけたダーク背景に覆われる
2. `3` が中央にパープル→シアングラデで表示。スケール 0.3 → 1 へポップ
3. 1 秒後 `2` に切替（前の数字は scale 1.5 + フェードアウト、新しい数字は scale 0.3 → 1）
4. 同様に `1`、`START!` と切り替わる
5. `START!` 表示の 1 秒後にオーバーレイが消えてボタン画面に戻る
6. パープルグロー（`drop-shadow`）で数字が淡く発光している

### タイミング検証

DevTools の Performance タブで「カウントダウン開始」クリックから `onComplete` 発火までの時間を計測。

- 期待: 約 4000ms（誤差 ±100ms）
- 各遷移アニメーションは 0.3 秒、表示時間は 1 秒間隔

### React 18 / 19 Strict Mode への配慮

開発モードでは `useEffect` が二重実行される。タイマーは `clearTimeout` でクリーンアップしているため、`3` がスキップされて `2` から始まるなどの不具合がないこと。

### `onComplete` のメモ化未指定時の挙動確認

呼び出し側で `onComplete={() => setShowing(false)}` のようにインライン関数を渡しても、`onComplete` 参照変更で `useEffect` が再実行される設計上、**index が `0` にリセットされず進行が続く** ことを確認する（`onComplete` は依存配列に入れているが、`setIndex` の更新を契機に毎レンダーで参照が変わる構造ではない）。

> 注: 万一不具合があれば `useEffect` の依存配列から `onComplete` を外し、`onComplete` を `useRef` で保持する設計に切り替える。実装後にプレビューで動作異常がないか必ず確認すること。

### Lint

```bash
cd apps/web && pnpm lint
```

### 確認後のクリーンアップ

`apps/web/src/app/dev/countdown-overlay/` を削除。

### 既知の未対応

- 効果音（カウントダウン中のビープ、START 時の歓声）は将来対応
- シーケンスのカスタマイズ（5 秒前から開始する等）は今 step では未対応。固定 3-2-1-START
