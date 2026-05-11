import {
  MatchingReactionRepository,
  MatchingReactionWithJoins,
  MatchingSessionRepository,
} from "../../../src/repository/prisma"
import { getReactions } from "../../../src/service/matching-service"
import { MatchingReaction, MatchingSession, TalkTheme } from "../../../src/types/domain"

const buildSession = (overrides?: Partial<MatchingSession>): MatchingSession => ({
  createdAt: new Date(),
  endedAt: null,
  endReason: null,
  id: 100,
  livekitRoomName: "matching:100",
  startedAt: new Date(),
  status: "ACTIVE",
  user1Id: 1,
  user2Id: 2,
  ...overrides,
})

const buildReaction = (overrides?: Partial<MatchingReaction>): MatchingReaction => ({
  choiceId: 11,
  createdAt: new Date(),
  id: 1,
  roundNumber: 1,
  sessionId: 100,
  themeId: 5,
  userId: 1,
  ...overrides,
})

const choiceTheme: TalkTheme = {
  category: "MATCHING",
  duration: 20,
  id: 5,
  isActive: true,
  sortOrder: 1,
  title: "好きな食べ物のジャンルは？",
  type: "CHOICE",
}

const freeTalkTheme: TalkTheme = {
  category: "MATCHING",
  duration: 30,
  id: 8,
  isActive: true,
  sortOrder: 10,
  title: "最近ハマっていることを教えて",
  type: "FREE_TALK",
}

describe("getReactions", () => {
  const buildDeps = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    const matchingReactionRepository: MatchingReactionRepository = {
      create: jest.fn(),
      findAllForSession: jest.fn(),
      findOpponentInSameRound: jest.fn(),
    }
    return { matchingReactionRepository, matchingSessionRepository }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("【異常系】非参加者 → 403", async () => {
    const d = buildDeps()
    ;(d.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())

    const result = await getReactions({ sessionId: 100, userId: 99 }, d)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(403)
  })

  it("【異常系】セッション無し → 404", async () => {
    const d = buildDeps()
    ;(d.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await getReactions({ sessionId: 999, userId: 1 }, d)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(404)
  })

  it("【正常系】リアクション 0 件 → rounds=[]", async () => {
    const d = buildDeps()
    ;(d.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.matchingReactionRepository.findAllForSession as jest.Mock).mockResolvedValue([])

    const result = await getReactions({ sessionId: 100, userId: 1 }, d)

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.rounds).toEqual([])
  })

  it("【正常系】複数 round / 自分のみ / 両者揃い / FREE_TALK の混在を正しくグルーピング", async () => {
    const d = buildDeps()
    ;(d.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    const all: MatchingReactionWithJoins[] = [
      /** round 1: CHOICE 一致 */
      {
        choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
        reaction: buildReaction({ id: 1, roundNumber: 1, userId: 1 }),
        theme: choiceTheme,
      },
      {
        choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
        reaction: buildReaction({ id: 2, roundNumber: 1, userId: 2 }),
        theme: choiceTheme,
      },
      /** round 2: CHOICE 不一致 */
      {
        choice: { emoji: "🍝", id: 12, label: "イタリアン", sortOrder: 2, themeId: 5 },
        reaction: buildReaction({ choiceId: 12, id: 3, roundNumber: 2, userId: 1 }),
        theme: choiceTheme,
      },
      {
        choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
        reaction: buildReaction({ id: 4, roundNumber: 2, userId: 2 }),
        theme: choiceTheme,
      },
      /** round 3: 自分のみ */
      {
        choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
        reaction: buildReaction({ id: 5, roundNumber: 3, userId: 1 }),
        theme: choiceTheme,
      },
      /** round 4: FREE_TALK 両者あり → is_match=false（CHOICE じゃないため） */
      {
        choice: null,
        reaction: buildReaction({ choiceId: null, id: 6, roundNumber: 4, themeId: 8, userId: 1 }),
        theme: freeTalkTheme,
      },
      {
        choice: null,
        reaction: buildReaction({ choiceId: null, id: 7, roundNumber: 4, themeId: 8, userId: 2 }),
        theme: freeTalkTheme,
      },
    ]
    ;(d.matchingReactionRepository.findAllForSession as jest.Mock).mockResolvedValue(all)

    const result = await getReactions({ sessionId: 100, userId: 1 }, d)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rounds).toEqual([
      {
        isMatch: true,
        myChoice: { id: 11, label: "和食" },
        peerChoice: { id: 11, label: "和食" },
        roundNumber: 1,
        theme: { id: 5, title: choiceTheme.title, type: "CHOICE" },
      },
      {
        isMatch: false,
        myChoice: { id: 12, label: "イタリアン" },
        peerChoice: { id: 11, label: "和食" },
        roundNumber: 2,
        theme: { id: 5, title: choiceTheme.title, type: "CHOICE" },
      },
      {
        isMatch: false,
        myChoice: { id: 11, label: "和食" },
        peerChoice: null,
        roundNumber: 3,
        theme: { id: 5, title: choiceTheme.title, type: "CHOICE" },
      },
      {
        isMatch: false,
        myChoice: null,
        peerChoice: null,
        roundNumber: 4,
        theme: { id: 8, title: freeTalkTheme.title, type: "FREE_TALK" },
      },
    ])
  })
})
