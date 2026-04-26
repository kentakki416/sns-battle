export default function LiveBadge({ size = "sm" }: { size?: "sm" | "md" }) {
  const sizeClasses = size === "md"
    ? "px-2.5 py-1 text-xs gap-1.5"
    : "px-1.5 py-0.5 text-[10px] gap-1"

  return (
    <span className={`inline-flex items-center rounded-md font-bold uppercase ${sizeClasses}`}
      style={{
        background: "linear-gradient(135deg, rgba(239,68,68,0.2) 0%, rgba(239,68,68,0.1) 100%)",
        border: "1px solid rgba(239,68,68,0.3)",
        color: "#EF4444",
      }}
    >
      <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-error" />
      LIVE
    </span>
  )
}
