"use client"

type Props = {
  unreadCount: number
}

export function NotificationBell({ unreadCount }: Props) {
  return (
    <button
      aria-label="通知"
      className="relative flex h-9 w-9 items-center justify-center rounded-lg text-lg text-text-muted transition hover:bg-white/[0.05] hover:text-white"
      type="button"
    >
      🔔
      {unreadCount > 0 && (
        <span
          className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none text-white"
          style={{ backgroundColor: "#EC4899" }}
        >
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  )
}
