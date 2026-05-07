"use client"

type Props = {
  collapsed: boolean
  onToggle: () => void
}

export function SidebarToggle({ collapsed, onToggle }: Props) {
  return (
    <div className="flex justify-center py-3">
      <button
        aria-label={collapsed ? "サイドバーを展開" : "サイドバーを折りたたむ"}
        className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted transition hover:bg-white/[0.05] hover:text-white"
        onClick={onToggle}
        type="button"
      >
        {collapsed ? "▸" : "◂"}
      </button>
    </div>
  )
}
