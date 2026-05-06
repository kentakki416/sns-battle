export type Provider = {
  enabled: boolean
  iconBg: string
  iconLabel: string
  id: "google" | "tiktok" | "twitter" | "instagram"
  label: string
}

export const PROVIDERS: ReadonlyArray<Provider> = [
  { enabled: true, iconBg: "#FFFFFF", iconLabel: "G", id: "google", label: "Google" },
  { enabled: false, iconBg: "#000000", iconLabel: "T", id: "tiktok", label: "TikTok" },
  { enabled: false, iconBg: "#1DA1F2", iconLabel: "X", id: "twitter", label: "X" },
  { enabled: false, iconBg: "#E4405F", iconLabel: "I", id: "instagram", label: "Instagram" },
]
