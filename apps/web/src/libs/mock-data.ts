/**
 * デザインプレビュー用モックデータ
 */

export type MockStream = {
  hostAvatar: string
  hostName: string
  id: string
  isLive: boolean
  thumbnailColor: string
  title: string
  viewers: number
}

export type MockBattle = {
  hostAvatar: string
  hostName: string
  hostStamps: number
  id: string
  opponentAvatar: string
  opponentName: string
  opponentStamps: number
  spectators: number
  status: "live" | "waiting" | "finished"
  title: string
}

export type MockUser = {
  avatar: string
  bio: string
  followers: number
  following: number
  id: string
  isLive: boolean
  name: string
}

export type MockChatMessage = {
  color: string
  id: string
  message: string
  timestamp: string
  userName: string
}

export type MockTheme = {
  choices: string[]
  id: string
  title: string
}

export type MockMatchingRound = {
  isMatch: boolean
  myChoice: string
  peerChoice: string
  round: number
  theme: string
}

export const mockStreams: MockStream[] = [
  {
    hostAvatar: "🎸",
    hostName: "ギターマスター",
    id: "stream-1",
    isLive: true,
    thumbnailColor: "from-purple-900 to-indigo-900",
    title: "金曜夜のアコースティックライブ🎵",
    viewers: 1234,
  },
  {
    hostAvatar: "🎮",
    hostName: "ゲーマーX",
    id: "stream-2",
    isLive: true,
    thumbnailColor: "from-green-900 to-emerald-900",
    title: "深夜のゲーム実況！リクエスト受付中",
    viewers: 567,
  },
  {
    hostAvatar: "🍳",
    hostName: "クッキングパパ",
    id: "stream-3",
    isLive: true,
    thumbnailColor: "from-orange-900 to-red-900",
    title: "プロが教える簡単レシピ配信",
    viewers: 890,
  },
  {
    hostAvatar: "🎨",
    hostName: "アート太郎",
    id: "stream-4",
    isLive: true,
    thumbnailColor: "from-pink-900 to-rose-900",
    title: "デジタルイラスト制作過程を公開",
    viewers: 345,
  },
  {
    hostAvatar: "💃",
    hostName: "ダンサーMiki",
    id: "stream-5",
    isLive: true,
    thumbnailColor: "from-cyan-900 to-blue-900",
    title: "K-POPダンスカバー練習中！",
    viewers: 678,
  },
]

export const mockBattles: MockBattle[] = [
  {
    hostAvatar: "🍫",
    hostName: "チョコ派リーダー",
    hostStamps: 42,
    id: "battle-1",
    opponentAvatar: "🍬",
    opponentName: "キャンディ女王",
    opponentStamps: 38,
    spectators: 150,
    status: "live",
    title: "きのこの山 vs たけのこの里",
  },
  {
    hostAvatar: "🐱",
    hostName: "猫好きA",
    hostStamps: 65,
    id: "battle-2",
    opponentAvatar: "🐶",
    opponentName: "犬好きB",
    opponentStamps: 71,
    spectators: 230,
    status: "live",
    title: "猫派 vs 犬派 最終決戦",
  },
  {
    hostAvatar: "☀️",
    hostName: "夏大好き",
    hostStamps: 0,
    id: "battle-3",
    opponentAvatar: "❄️",
    opponentName: "",
    opponentStamps: 0,
    spectators: 0,
    status: "waiting",
    title: "夏 vs 冬 どっちが好き？",
  },
  {
    hostAvatar: "🍜",
    hostName: "ラーメン通",
    hostStamps: 0,
    id: "battle-4",
    opponentAvatar: "🍝",
    opponentName: "",
    opponentStamps: 0,
    spectators: 0,
    status: "waiting",
    title: "ラーメン vs パスタ",
  },
  {
    hostAvatar: "🎵",
    hostName: "ロック好き",
    hostStamps: 88,
    id: "battle-5",
    opponentAvatar: "🎶",
    opponentName: "ポップ好き",
    opponentStamps: 92,
    spectators: 180,
    status: "finished",
    title: "ロック vs ポップ 音楽対決",
  },
]

export const mockUsers: MockUser[] = [
  {
    avatar: "🎸",
    bio: "毎週金曜にアコースティックライブ配信中！",
    followers: 12400,
    following: 234,
    id: "user-1",
    isLive: true,
    name: "ギターマスター",
  },
  {
    avatar: "🎮",
    bio: "ゲーム実況者。FPS中心にやってます。",
    followers: 8900,
    following: 567,
    id: "user-2",
    isLive: true,
    name: "ゲーマーX",
  },
  {
    avatar: "🍳",
    bio: "現役シェフが家庭でも作れるプロの味を伝授！",
    followers: 5600,
    following: 123,
    id: "user-3",
    isLive: false,
    name: "クッキングパパ",
  },
  {
    avatar: "🎨",
    bio: "デジタルイラストレーター。依頼も受付中。",
    followers: 3400,
    following: 890,
    id: "user-4",
    isLive: false,
    name: "アート太郎",
  },
  {
    avatar: "💃",
    bio: "K-POPダンサー。カバーダンスやってます。",
    followers: 7800,
    following: 345,
    id: "user-5",
    isLive: false,
    name: "ダンサーMiki",
  },
]

export const mockChatMessages: MockChatMessage[] = [
  { color: "#9147ff", id: "msg-1", message: "こんにちは！", timestamp: "21:00", userName: "ユーザーA" },
  { color: "#00e676", id: "msg-2", message: "今日も配信ありがとう🎉", timestamp: "21:01", userName: "ユーザーB" },
  { color: "#e91e8c", id: "msg-3", message: "この曲リクエストしたい！", timestamp: "21:02", userName: "ユーザーC" },
  { color: "#ffb300", id: "msg-4", message: "素晴らしい演奏！", timestamp: "21:03", userName: "ユーザーD" },
  { color: "#bf94ff", id: "msg-5", message: "毎週楽しみにしてます", timestamp: "21:04", userName: "ユーザーE" },
  { color: "#9147ff", id: "msg-6", message: "888888", timestamp: "21:05", userName: "ユーザーA" },
  { color: "#00e676", id: "msg-7", message: "すごい！", timestamp: "21:06", userName: "ユーザーB" },
  { color: "#e91e8c", id: "msg-8", message: "アンコール！", timestamp: "21:07", userName: "ユーザーC" },
]

export const mockThemes: MockTheme[] = [
  { choices: ["🍣 和食", "🍝 洋食", "🍜 中華", "🍛 カレー"], id: "theme-1", title: "好きな食べ物のジャンルは？" },
  { choices: ["🏠 インドア", "🏕 アウトドア", "🛒 ショッピング", "😴 睡眠"], id: "theme-2", title: "休日の過ごし方は？" },
  { choices: ["🍺 ビール", "🍷 ワイン", "🍶 日本酒", "🚫 飲まない"], id: "theme-3", title: "好きなお酒は？" },
  { choices: ["🌊 海", "⛰ 山", "🏙 都会", "🌾 田舎"], id: "theme-4", title: "旅行するならどこ？" },
  { choices: ["🐱 猫", "🐶 犬", "🐰 うさぎ", "🦜 鳥"], id: "theme-5", title: "飼いたいペットは？" },
]

export const mockMatchingRounds: MockMatchingRound[] = [
  { isMatch: true, myChoice: "🍣 和食", peerChoice: "🍣 和食", round: 1, theme: "好きな食べ物のジャンルは？" },
  { isMatch: false, myChoice: "🏠 インドア", peerChoice: "🏕 アウトドア", round: 2, theme: "休日の過ごし方は？" },
  { isMatch: true, myChoice: "🍺 ビール", peerChoice: "🍺 ビール", round: 3, theme: "好きなお酒は？" },
  { isMatch: false, myChoice: "🌊 海", peerChoice: "⛰ 山", round: 4, theme: "旅行するならどこ？" },
  { isMatch: true, myChoice: "🐱 猫", peerChoice: "🐱 猫", round: 5, theme: "飼いたいペットは？" },
  { isMatch: true, myChoice: "🍣 和食", peerChoice: "🍣 和食", round: 6, theme: "好きなラーメンの味は？" },
  { isMatch: false, myChoice: "🏠 インドア", peerChoice: "🏕 アウトドア", round: 7, theme: "デートするなら？" },
  { isMatch: true, myChoice: "🎮 ゲーム", peerChoice: "🎮 ゲーム", round: 8, theme: "趣味は？" },
  { isMatch: false, myChoice: "☀️ 朝型", peerChoice: "🌙 夜型", round: 9, theme: "朝型？夜型？" },
  { isMatch: true, myChoice: "🍕 ピザ", peerChoice: "🍕 ピザ", round: 10, theme: "ジャンクフードといえば？" },
]
