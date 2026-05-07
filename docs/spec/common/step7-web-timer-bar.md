# step7-web-timer-bar.md

`<TimerBar>` を実装する。マッチング・バトル・配信中のテーマ切替などで画面上部に表示する 4px の進行度バー。残り時間に応じて色が変わる（通常: パープル→シアングラデ、10 秒以下: アンバー、5 秒以下: 赤 + パルス）。

UI 仕様は `docs/spec/common/README.md` の [TimerBar](./README.md#timerbar-progress-remainingsecマッチングバトル共通) を参照。

進行アニメーションは CSS `@keyframes timer-shrink` を `${duration}s linear forwards` で適用し、テーマが切り替わるたびに `key` を更新して再アニメさせる方式を採用する。

## 対応内容

### ファイル構成

```
apps/web/src/components/ui/
└── timer-bar.tsx
```

### `globals.css` に keyframes 追加

`apps/web/src/app/globals.css` に未定義であれば追加する。

```css
@keyframes timer-shrink {
  from {
    width: 100%;
  }
  to {
    width: 0%;
  }
}
```

### `timer-bar.tsx`

```typescript
"use client"

type Props = {
  /**
   * テーマやセクションが切り替わったときに変化する識別子。
   * key として使用してアニメーションを最初からやり直す。
   */
  segmentKey: string | number
  /**
   * 1 セクションの総秒数（アニメーションの duration として使う）。
   */
  totalSec: number
  /**
   * 現在の残り秒数。色変化（warning / error）の判定に使う。
   */
  remainingSec: number
}

const getGradient = (remainingSec: number): string => {
  if (remainingSec <= 5) return "linear-gradient(90deg, #EF4444 0%, #EF4444 100%)"
  if (remainingSec <= 10) return "linear-gradient(90deg, #FBBF24 0%, #FBBF24 100%)"
  return "linear-gradient(90deg, #CBACF9 0%, #0EA5E9 50%, #CBACF9 100%)"
}

export function TimerBar({ remainingSec, segmentKey, totalSec }: Props) {
  const isCritical = remainingSec <= 5

  return (
    <div className="absolute left-0 right-0 top-0 h-1 bg-white/[0.08]">
      <div
        className={[
          "h-full",
          isCritical ? "animate-pulse" : "",
        ].join(" ")}
        key={segmentKey}
        style={{
          animation: `timer-shrink ${totalSec}s linear forwards`,
          background: getGradient(remainingSec),
        }}
      />
    </div>
  )
}
```

### バレルエクスポート

```typescript
export { CountdownOverlay } from "./countdown-overlay"
export { LiveBadge } from "./live-badge"
export { TimerBar } from "./timer-bar"
export { VideoChatOverlay } from "./video-chat-overlay"
export type { ChatMessage } from "./video-chat-overlay"
```

### 使用パターン

呼び出し側は以下を行う:

1. テーマ切替時に `segmentKey`（例: テーマ ID）を変える → アニメ再開
2. `setInterval(1000)` で残り秒数を 1 秒ごとに減らし、`remainingSec` を更新 → 色判定切替
3. アニメ自体は CSS で滑らかに 0% まで縮小（残り秒数の更新と独立）

```typescript
"use client"

import { useEffect, useState } from "react"

import { TimerBar } from "@/components/ui"

const THEME_DURATION = 60

export function ThemeProgress({ themeId }: { themeId: number }) {
  const [remaining, setRemaining] = useState(THEME_DURATION)

  useEffect(() => {
    setRemaining(THEME_DURATION)
    const id = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [themeId])

  return (
    <TimerBar
      remainingSec={remaining}
      segmentKey={themeId}
      totalSec={THEME_DURATION}
    />
  )
}
```

## 動作確認

### プレビューページ

`apps/web/src/app/dev/timer-bar/page.tsx` で確認。

```typescript
"use client"

import { useEffect, useState } from "react"

import { TimerBar } from "@/components/ui/timer-bar"

const TOTAL = 15

export default function TimerBarPreviewPage() {
  const [segmentKey, setSegmentKey] = useState(1)
  const [remaining, setRemaining] = useState(TOTAL)

  useEffect(() => {
    setRemaining(TOTAL)
    const id = window.setInterval(() => {
      setRemaining((prev) => Math.max(0, prev - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [segmentKey])

  return (
    <main className="relative min-h-screen bg-dark-base">
      <TimerBar
        remainingSec={remaining}
        segmentKey={segmentKey}
        totalSec={TOTAL}
      />
      <div className="flex min-h-screen items-center justify-center gap-6">
        <p className="text-white">残り {remaining} 秒</p>
        <button
          className="rounded-lg bg-primary-glow px-4 py-2 text-primary"
          onClick={() => setSegmentKey((prev) => prev + 1)}
          type="button"
        >
          セクション切替（再開）
        </button>
      </div>
    </main>
  )
}
```

### 動作確認項目

`pnpm dev` 後 `http://localhost:3000/dev/timer-bar`:

1. 画面上部に高さ 4px のバーが表示される
2. 開始時点で全幅、15 秒かけて滑らかに 0% まで縮小
3. 残り 11〜15 秒: パープル→シアン→パープルの 3 点グラデ
4. 残り 6〜10 秒: アンバー単色（`#FBBF24`）に変化
5. 残り 1〜5 秒: 赤単色（`#EF4444`）+ `animate-pulse` で点滅
6. 「セクション切替（再開）」クリック → バーが瞬時に 100% に戻り、再度 15 秒かけて縮小

### タイミング検証

DevTools の Performance タブでアニメ duration を確認:

- CSS animation の duration が `15s` になっていること
- `segmentKey` 更新時に `<div>` が再生成されアニメが先頭から再生されること

### Lint

```bash
cd apps/web && pnpm lint
```

### 確認後のクリーンアップ

`apps/web/src/app/dev/timer-bar/` を削除。

### 既知の未対応

- 一時停止（pause）／再開機能は今 step では未対応。マッチング・バトルの仕様で必要になったら拡張する
- バーの高さ（4px 固定）はカスタマイズ不可。必要になったら `size` prop を追加
