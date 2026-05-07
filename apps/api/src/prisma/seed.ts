/* eslint-disable no-console */
import type { AnimationType, StampCategory, TalkThemeCategory, TalkThemeType } from "./generated/enums"
import { prisma } from "./prisma.client"

type StampMasterSeed = {
  animationType: AnimationType
  category: StampCategory
  emoji: string
  isPremium: boolean
  name: string
  price: number
  sortOrder: number
}

type TalkThemeChoiceSeed = {
  emoji: string
  label: string
  sortOrder: number
}

type TalkThemeSeed = {
  category: TalkThemeCategory
  choices: TalkThemeChoiceSeed[]
  duration: number
  sortOrder: number
  title: string
  type: TalkThemeType
}

type HobbyMasterSeed = {
  name: string
  sortOrder: number
}

/**
 * スタンプマスターのシードデータ
 * GENERAL（汎用）/ BATTLE / MATCHING の各カテゴリに最小セットを用意
 */
const stampMasters: StampMasterSeed[] = [
  /** GENERAL（ライブ配信などで共通利用） */
  { animationType: "FLOAT", category: "GENERAL", emoji: "👏", isPremium: false, name: "拍手", price: 0, sortOrder: 1 },
  { animationType: "FLOAT", category: "GENERAL", emoji: "❤️", isPremium: false, name: "ハート", price: 0, sortOrder: 2 },
  { animationType: "BOUNCE", category: "GENERAL", emoji: "✨", isPremium: false, name: "キラキラ", price: 0, sortOrder: 3 },
  { animationType: "FLOAT", category: "GENERAL", emoji: "🎉", isPremium: false, name: "クラッカー", price: 0, sortOrder: 4 },

  /** BATTLE（バトルルーム専用） */
  { animationType: "EXPLODE", category: "BATTLE", emoji: "🔥", isPremium: false, name: "ファイア", price: 0, sortOrder: 1 },
  { animationType: "BOUNCE", category: "BATTLE", emoji: "💯", isPremium: false, name: "100点", price: 0, sortOrder: 2 },
  { animationType: "SHAKE", category: "BATTLE", emoji: "⚡", isPremium: false, name: "稲妻", price: 0, sortOrder: 3 },
  { animationType: "EXPLODE", category: "BATTLE", emoji: "💥", isPremium: false, name: "爆発", price: 0, sortOrder: 4 },

  /** MATCHING（マッチング中の控えめなリアクション） */
  { animationType: "FLOAT", category: "MATCHING", emoji: "😄", isPremium: false, name: "笑顔", price: 0, sortOrder: 1 },
  { animationType: "FLOAT", category: "MATCHING", emoji: "👍", isPremium: false, name: "いいね", price: 0, sortOrder: 2 },
  { animationType: "FLOAT", category: "MATCHING", emoji: "🤝", isPremium: false, name: "ナイス", price: 0, sortOrder: 3 },
]

/**
 * トークテーマのシードデータ（マッチング・バトル両カテゴリ）
 */
const talkThemes: TalkThemeSeed[] = [
  /** MATCHING - 選択肢タイプ */
  {
    category: "MATCHING",
    choices: [
      { emoji: "🍣", label: "和食", sortOrder: 1 },
      { emoji: "🍝", label: "イタリアン", sortOrder: 2 },
      { emoji: "🌮", label: "メキシカン", sortOrder: 3 },
      { emoji: "🍔", label: "ファストフード", sortOrder: 4 },
    ],
    duration: 20,
    sortOrder: 1,
    title: "好きな食べ物のジャンルは？",
    type: "CHOICE",
  },
  {
    category: "MATCHING",
    choices: [
      { emoji: "🌊", label: "海派", sortOrder: 1 },
      { emoji: "⛰️", label: "山派", sortOrder: 2 },
    ],
    duration: 20,
    sortOrder: 2,
    title: "休日に行くなら海と山どっち？",
    type: "CHOICE",
  },
  {
    category: "MATCHING",
    choices: [
      { emoji: "🌅", label: "朝型", sortOrder: 1 },
      { emoji: "🌙", label: "夜型", sortOrder: 2 },
    ],
    duration: 20,
    sortOrder: 3,
    title: "朝型と夜型、どっち？",
    type: "CHOICE",
  },

  /** MATCHING - フリートーク */
  { category: "MATCHING", choices: [], duration: 30, sortOrder: 10, title: "最近ハマっていることを教えて", type: "FREE_TALK" },
  { category: "MATCHING", choices: [], duration: 30, sortOrder: 11, title: "次の連休にやりたいことは？", type: "FREE_TALK" },

  /** BATTLE - フリートーク（語る系） */
  { category: "BATTLE", choices: [], duration: 60, sortOrder: 1, title: "好きな映画について熱く語ってください", type: "FREE_TALK" },
  { category: "BATTLE", choices: [], duration: 60, sortOrder: 2, title: "人生で最も衝撃的だった出来事", type: "FREE_TALK" },
]

/**
 * 趣味マスターのシードデータ
 * Phase 3 で追加。Admin 画面で随時追加できるようマスター管理する
 */
const hobbyMasters: HobbyMasterSeed[] = [
  { name: "音楽鑑賞", sortOrder: 1 },
  { name: "映画", sortOrder: 2 },
  { name: "読書", sortOrder: 3 },
  { name: "アニメ・漫画", sortOrder: 4 },
  { name: "ゲーム", sortOrder: 5 },
  { name: "スポーツ観戦", sortOrder: 6 },
  { name: "サッカー", sortOrder: 7 },
  { name: "野球", sortOrder: 8 },
  { name: "バスケットボール", sortOrder: 9 },
  { name: "筋トレ", sortOrder: 10 },
  { name: "ランニング", sortOrder: 11 },
  { name: "ヨガ", sortOrder: 12 },
  { name: "料理", sortOrder: 13 },
  { name: "カフェ巡り", sortOrder: 14 },
  { name: "旅行", sortOrder: 15 },
  { name: "キャンプ", sortOrder: 16 },
  { name: "写真", sortOrder: 17 },
  { name: "プログラミング", sortOrder: 18 },
  { name: "アート・絵画", sortOrder: 19 },
  { name: "ペット", sortOrder: 20 },
]

const upsertHobbyMaster = async (hobby: HobbyMasterSeed): Promise<void> => {
  await prisma.hobbyMaster.upsert({
    create: { isActive: true, name: hobby.name, sortOrder: hobby.sortOrder },
    update: { sortOrder: hobby.sortOrder },
    where: { name: hobby.name },
  })
}

const upsertStampMaster = async (stamp: StampMasterSeed): Promise<void> => {
  const existing = await prisma.stampMaster.findFirst({
    where: { category: stamp.category, name: stamp.name },
  })

  if (existing) {
    await prisma.stampMaster.update({ data: stamp, where: { id: existing.id } })
    return
  }

  await prisma.stampMaster.create({ data: stamp })
}

const upsertTalkTheme = async (theme: TalkThemeSeed): Promise<void> => {
  const existing = await prisma.talkTheme.findFirst({
    where: { category: theme.category, title: theme.title },
  })

  const data = {
    category: theme.category,
    duration: theme.duration,
    sortOrder: theme.sortOrder,
    title: theme.title,
    type: theme.type,
  }

  const persisted = existing
    ? await prisma.talkTheme.update({ data, where: { id: existing.id } })
    : await prisma.talkTheme.create({ data })

  if (theme.type !== "CHOICE" || theme.choices.length === 0) return

  /** CHOICE テーマは選択肢を一旦削除して入れ直す（冪等性を保つ） */
  await prisma.talkThemeChoice.deleteMany({ where: { themeId: persisted.id } })
  await prisma.talkThemeChoice.createMany({
    data: theme.choices.map((choice) => ({
      emoji: choice.emoji,
      label: choice.label,
      sortOrder: choice.sortOrder,
      themeId: persisted.id,
    })),
  })
}

const main = async (): Promise<void> => {
  console.log("Seeding stamp_masters...")
  for (const stamp of stampMasters) {
    await upsertStampMaster(stamp)
  }

  console.log("Seeding talk_themes...")
  for (const theme of talkThemes) {
    await upsertTalkTheme(theme)
  }

  console.log("Seeding hobby_masters...")
  for (const hobby of hobbyMasters) {
    await upsertHobbyMaster(hobby)
  }

  console.log("Seed completed (PostgreSQL)")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
