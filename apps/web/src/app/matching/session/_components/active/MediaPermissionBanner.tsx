"use client"

import type { UseLiveKitRoomError } from "../hooks/useLiveKitRoom"

type Props = {
  error: UseLiveKitRoomError
  onRetry: () => void
}

const titleFor = (kind: UseLiveKitRoomError["kind"]): string => {
  switch (kind) {
  case "permission_denied":
    return "📷 カメラ / マイクの許可が必要です"
  case "connection_failed":
    return "通話サーバーに接続できませんでした"
  case "token_failed":
    return "セッション情報の取得に失敗しました"
  }
}

const descriptionFor = (kind: UseLiveKitRoomError["kind"]): string => {
  switch (kind) {
  case "permission_denied":
    return "ブラウザのアドレスバー左のアイコンからカメラ / マイクを許可した上で再試行してください。声と映像が無いと相手にあなたの様子が伝わりません"
  case "connection_failed":
    return "ネットワーク状態を確認して再試行してください。リロードしても直らない場合は時間をおいて再度マッチング開始してください"
  case "token_failed":
    return "再度マッチングを開始し直すか、しばらくしてから再試行してください"
  }
}

/**
 * LiveKit 接続周りのエラー（カメラ拒否 / Room 接続失敗 / token 発行失敗）を画面上部に通知する
 * 半透明バナー。`onRetry` クリックで親が `location.reload()` などの復旧アクションを実行する。
 */
export function MediaPermissionBanner({ error, onRetry }: Props) {
  return (
    <div
      className="absolute inset-x-0 top-12 z-30 mx-auto max-w-md rounded-2xl border border-warning/50 bg-dark-elevated/95 px-5 py-4 text-sm text-white shadow-[0_0_24px_rgba(251,191,36,0.25)] backdrop-blur"
      role="alert"
    >
      <p className="font-semibold">{titleFor(error.kind)}</p>
      <p className="mt-1 text-xs text-text-muted">{descriptionFor(error.kind)}</p>
      <button
        className="mt-3 rounded-full bg-warning px-4 py-1.5 text-xs font-medium text-dark-base transition hover:bg-warning/80"
        onClick={onRetry}
        type="button"
      >
        再試行
      </button>
    </div>
  )
}
