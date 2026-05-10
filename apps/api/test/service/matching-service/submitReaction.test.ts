import { ILiveKitClient } from "../../../src/client/livekit"
import {
  MatchingReactionRepository,
  MatchingReactionWithJoins,
  MatchingSessionRepository,
  TalkThemeRepository,
} from "../../../src/repository/prisma"
import { submitReaction } from "../../../src/service/matching-service"
import { MatchingReaction, MatchingSession, TalkThemeWithChoices } from "../../../src/types/domain"

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
  id: 555,
  roundNumber: 1,
  sessionId: 100,
  themeId: 5,
  userId: 1,
  ...overrides,
})

const buildChoiceTheme = (): TalkThemeWithChoices => ({
  choices: [
    { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
    { emoji: "🍝", id: 12, label: "イタリアン", sortOrder: 2, themeId: 5 },
  ],
  theme: {
    category: "MATCHING",
    duration: 20,
    id: 5,
    isActive: true,
    sortOrder: 1,
    title: "好きな食べ物のジャンルは？",
    type: "CHOICE",
  },
})

const buildFreeTalkTheme = (): TalkThemeWithChoices => ({
  choices: [],
  theme: {
    category: "MATCHING",
    duration: 30,
    id: 8,
    isActive: true,
    sortOrder: 10,
    title: "最近ハマっていることを教えて",
    type: "FREE_TALK",
  },
})

describe("submitReaction", () => {
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
    const talkThemeRepository: TalkThemeRepository = {
      findById: jest.fn(),
    }
    const livekitClient: ILiveKitClient = {
      generateRoomToken: jest.fn(),
      publishData: jest.fn().mockResolvedValue(undefined),
    }
    return {
      client: { livekitClient },
      repo: {
        matchingReactionRepository,
        matchingSessionRepository,
        talkThemeRepository,
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("自分が先に回答 → matched=null / publishData 未呼び出し", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockResolvedValue(
      buildReaction({ id: 999 }),
    )
    ;(d.repo.matchingReactionRepository.findOpponentInSameRound as jest.Mock).mockResolvedValue(null)

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        matched: null,
        myChoice: null,
        peerChoice: null,
        reactionId: 999,
      })
    }
    expect(d.client.livekitClient.publishData).not.toHaveBeenCalled()
  })

  it("CHOICE で両者一致 → matched=true + publishData 呼び出し", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockResolvedValue(buildReaction())
    const opponent: MatchingReactionWithJoins = {
      choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
      reaction: buildReaction({ id: 444, userId: 2 }),
      theme: buildChoiceTheme().theme,
    }
    ;(d.repo.matchingReactionRepository.findOpponentInSameRound as jest.Mock).mockResolvedValue(
      opponent,
    )

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        matched: true,
        myChoice: { id: 11, label: "和食" },
        peerChoice: { id: 11, label: "和食" },
      })
    }
    expect(d.client.livekitClient.publishData).toHaveBeenCalledWith({
      payload: {
        matched: true,
        round_number: 1,
        theme_id: 5,
        user1_choice_id: 11,
        user2_choice_id: 11,
      },
      roomName: "matching:100",
      topic: "matching:reaction_match",
    })
  })

  it("CHOICE で両者不一致 → matched=false + payload にそれぞれの choice_id", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 2, user2Id: 1 }),
    )
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockResolvedValue(
      buildReaction({ choiceId: 12, userId: 1 }),
    )
    const opponent: MatchingReactionWithJoins = {
      choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
      reaction: buildReaction({ choiceId: 11, id: 444, userId: 2 }),
      theme: buildChoiceTheme().theme,
    }
    ;(d.repo.matchingReactionRepository.findOpponentInSameRound as jest.Mock).mockResolvedValue(
      opponent,
    )

    const result = await submitReaction(
      { choiceId: 12, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.matched).toBe(false)
    }
    /** session.user1Id=2 / user2Id=1 / 自分=1（user2）。user1=peer=11、user2=mine=12 */
    expect(d.client.livekitClient.publishData).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          matched: false,
          user1_choice_id: 11,
          user2_choice_id: 12,
        }),
      }),
    )
  })

  it("FREE_TALK は両者揃っても matched=null / publishData 未呼び出し", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildFreeTalkTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockResolvedValue(
      buildReaction({ choiceId: null, themeId: 8 }),
    )
    ;(d.repo.matchingReactionRepository.findOpponentInSameRound as jest.Mock).mockResolvedValue({
      choice: null,
      reaction: buildReaction({ choiceId: null, id: 444, themeId: 8, userId: 2 }),
      theme: buildFreeTalkTheme().theme,
    })

    const result = await submitReaction(
      { choiceId: null, roundNumber: 1, sessionId: 100, themeId: 8, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.matched).toBeNull()
    }
    expect(d.client.livekitClient.publishData).not.toHaveBeenCalled()
  })

  it("CHOICE で choice_id=null → 400", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())

    const result = await submitReaction(
      { choiceId: null, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
    expect(d.repo.matchingReactionRepository.create).not.toHaveBeenCalled()
  })

  it("非参加者 → 403", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 99 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
  })

  it("ENDED → 410", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "ENDED" }),
    )

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(410)
      expect(result.error.type).toBe("GONE")
    }
  })

  it("存在しないテーマ → 404", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 999, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
    }
  })

  it("同 round 2 度目 (P2002) → 409", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockRejectedValue({
      code: "P2002",
    })

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(409)
      expect(result.error.type).toBe("CONFLICT")
    }
  })

  it("publishData が失敗してもレスポンスは ok（best-effort）", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.talkThemeRepository.findById as jest.Mock).mockResolvedValue(buildChoiceTheme())
    ;(d.repo.matchingReactionRepository.create as jest.Mock).mockResolvedValue(buildReaction())
    ;(d.repo.matchingReactionRepository.findOpponentInSameRound as jest.Mock).mockResolvedValue({
      choice: { emoji: "🍣", id: 11, label: "和食", sortOrder: 1, themeId: 5 },
      reaction: buildReaction({ id: 444, userId: 2 }),
      theme: buildChoiceTheme().theme,
    })
    ;(d.client.livekitClient.publishData as jest.Mock).mockRejectedValue(new Error("LiveKit down"))

    const result = await submitReaction(
      { choiceId: 11, roundNumber: 1, sessionId: 100, themeId: 5, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.matched).toBe(true)
    }
  })
})
