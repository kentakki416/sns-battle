# step4-web-live-badge.md

`<LiveBadge>` を実装する。配信中・マッチング中・バトル中のユーザーカードや配信ページに使う再利用可能な小さなバッジ。

UI 仕様は `docs/spec/common/README.md` の [LiveBadge](./README.md#livebadge-size-sm--mdappswebsrccomponentsuilive-badgetsx) を参照。

## 対応内容

### ファイル構成

```
apps/web/src/components/ui/
└── live-badge.tsx
```

### `live-badge.tsx`

```typescript
type Props = {
  size?: "md" | "sm"
}

const SIZE_CLASS: Record<NonNullable<Props["size"]>, string> = {
  md: "gap-1.5 px-2.5 py-1 text-xs",
  sm: "gap-1 px-1.5 py-0.5 text-[10px]",
}

const DOT_SIZE: Record<NonNullable<Props["size"]>, string> = {
  md: "h-2 w-2",
  sm: "h-1.5 w-1.5",
}

export function LiveBadge({ size = "sm" }: Props) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full font-bold uppercase",
        SIZE_CLASS[size],
      ].join(" ")}
      style={{
        background:
          "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.1) 100%)",
        border: "1px solid rgba(239,68,68,0.3)",
        color: "#EF4444",
      }}
    >
      <span
        className={[
          "animate-pulse rounded-full",
          DOT_SIZE[size],
        ].join(" ")}
        style={{ backgroundColor: "#EF4444" }}
      />
      LIVE
    </span>
  )
}
```

### バレルエクスポート

`apps/web/src/components/ui/index.ts` を作成し、以降の UI コンポーネントをアルファベット順でまとめてエクスポートする（CLAUDE.md のバレルエクスポートルールに従う）。

```typescript
export { LiveBadge } from "./live-badge"
```

step5 以降で `confetti-effect`、`countdown-overlay`、`timer-bar`、`video-chat-overlay` を追加する際もこの順序で追記する。

### 使用例（参考、実装は不要）

```typescript
import { LiveBadge } from "@/components/ui/live-badge"

<LiveBadge />          {/* sm（デフォルト） */}
<LiveBadge size="md" /> {/* md */}
```

## 動作確認

### ビジュアル確認用の一時ページ

このコンポーネント単体を確認するため、`apps/web/src/app/_dev/live-badge/page.tsx` に開発用プレビューを作る。`_dev` プレフィックスで App Router のルート対象外にする…と思いきや、Next.js の `_` プレフィックスはルート除外ではない。**確認後に削除する前提で `apps/web/src/app/dev/live-badge/page.tsx` として作成し、確認後に `git rm` する**。

```typescript
import { LiveBadge } from "@/components/ui/live-badge"

export default function LiveBadgePreviewPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-dark-base">
      <div className="flex items-center gap-4">
        <span className="text-text-muted">sm:</span>
        <LiveBadge size="sm" />
      </div>
      <div className="flex items-center gap-4">
        <span className="text-text-muted">md:</span>
        <LiveBadge size="md" />
      </div>
    </div>
  )
}
```

`pnpm dev` 後 `http://localhost:3000/dev/live-badge` で確認:

1. `sm` バッジ: 高さ約 18px、左に点滅する小さい赤ドット、右に「LIVE」
2. `md` バッジ: 高さ約 24px、ドットとテキストが一回り大きい
3. 背景は赤系の半透明グラデ、枠は赤の薄線、文字は鮮やかな赤
4. ドットが `animate-pulse` でゆっくり明滅

### サイドバー連携の動作確認

step3 で実装した `SidebarFollowing` の LIVE 中ユーザー表示を、現在のテキスト `<span className="text-error">LIVE</span>` から `<LiveBadge size="sm" />` に置き換える。

```typescript
import { LiveBadge } from "@/components/ui/live-badge"

{user.isLive && user.viewerCount !== undefined && (
  <span className="flex items-center gap-1.5 text-[10px] text-text-muted">
    <LiveBadge size="sm" />
    <span>{user.viewerCount.toLocaleString()}視聴</span>
  </span>
)}
```

サイドバーで:
- ギターマスター行に LiveBadge が表示される
- ドットが点滅する
- 文字色・枠・背景が仕様通り

### 確認後のクリーンアップ

確認 OK なら `apps/web/src/app/dev/` ディレクトリごと削除する。

### Lint 確認

```bash
cd apps/web && pnpm lint
```

import ソート、object key ソート、ダブルクォート、セミコロンなしが守られていること。

### 既知の未対応

- 視聴者数表示は別コンポーネント化していない（Phase 5 / Phase 6 のカード実装時に必要に応じて切り出す）
