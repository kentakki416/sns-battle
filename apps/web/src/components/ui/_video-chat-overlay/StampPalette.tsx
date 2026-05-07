"use client"

type Props = {
  emojis: ReadonlyArray<string>
  onSelect: (emoji: string) => void
}

export function StampPalette({ emojis, onSelect }: Props) {
  return (
    <div
      className="grid grid-cols-6 gap-2 px-4 py-3"
      style={{
        backdropFilter: "blur(12px)",
        background: "rgba(0,3,25,0.7)",
        borderTop: "1px solid rgba(255,255,255,0.05)",
      }}
    >
      {emojis.map((emoji) => (
        <button
          aria-label={`スタンプ ${emoji}`}
          className="flex h-11 items-center justify-center rounded-lg text-2xl transition hover:scale-110 hover:bg-white/[0.08]"
          key={emoji}
          onClick={() => onSelect(emoji)}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
