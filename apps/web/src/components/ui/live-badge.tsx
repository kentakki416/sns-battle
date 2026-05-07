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
        className={["animate-pulse rounded-full", DOT_SIZE[size]].join(" ")}
        style={{ backgroundColor: "#EF4444" }}
      />
      LIVE
    </span>
  )
}
