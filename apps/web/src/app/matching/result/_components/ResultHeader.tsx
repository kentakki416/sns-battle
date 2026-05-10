"use client"

import type { MatchingSessionParticipant } from "@repo/api-schema"

type Props = {
  matchCount: number
  me: MatchingSessionParticipant
  peer: MatchingSessionParticipant
  totalRounds: number
}

/**
 * 結果画面のヘッダー。
 * タイトル + 自分／相手のアバター対面 + 一致数を表示する。
 */
export function ResultHeader({ matchCount, me, peer, totalRounds }: Props) {
  return (
    <header className="flex flex-col items-center gap-6 text-center">
      <div>
        <h1 className="text-2xl font-bold text-white">マッチング終了!</h1>
        <p className="mt-1 text-sm text-text-muted">お疲れさまでした</p>
      </div>

      <div className="flex items-center justify-center gap-5">
        <ParticipantAvatar
          colorClass="glow-border-purple"
          label="あなた"
          participant={me}
        />
        <span
          aria-hidden
          className="bg-gradient-to-br from-pink-400 to-primary bg-clip-text text-3xl font-bold text-transparent"
        >
          ♥
        </span>
        <ParticipantAvatar
          colorClass="glow-border-cyan"
          label={peer.name ?? "相手"}
          participant={peer}
        />
      </div>

      <div className="flex flex-col items-center">
        <p className="text-5xl font-bold leading-none">
          <span className="bg-gradient-to-r from-primary to-cyan bg-clip-text text-transparent">
            {matchCount}
          </span>
          <span className="text-text-muted"> / {totalRounds}</span>
        </p>
        <p className="mt-2 text-sm text-text-muted">一致した回答</p>
      </div>
    </header>
  )
}

type AvatarProps = {
  colorClass: string
  label: string
  participant: MatchingSessionParticipant
}

function ParticipantAvatar({ colorClass, label, participant }: AvatarProps) {
  const initial = (participant.name ?? "?").trim().charAt(0).toUpperCase() || "?"
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-dark-surface ${colorClass}`}
      >
        {participant.avatar_url ? (
          /**
           * アバター画像。next/image を使うと外部ホスト許可設定が必要なので、
           * 結果画面ではシンプルに img タグで表示する。
           */
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={label}
            className="h-full w-full object-cover"
            src={participant.avatar_url}
          />
        ) : (
          <span className="text-2xl font-bold text-white">{initial}</span>
        )}
      </div>
      <p className="max-w-[88px] truncate text-xs text-text-muted">{label}</p>
    </div>
  )
}
