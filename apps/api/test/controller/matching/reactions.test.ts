import request from "supertest"

import { ILiveKitClient } from "../../../src/client/livekit"
import { MatchingReactionSubmitController } from "../../../src/controller/matching/reaction-submit"
import { MatchingReactionsListController } from "../../../src/controller/matching/reactions-list"
import { generateAccessToken } from "../../../src/lib/jwt"
import { PrismaMatchingReactionRepository } from "../../../src/repository/prisma/matching-reaction-repository"
import { PrismaMatchingSessionRepository } from "../../../src/repository/prisma/matching-session-repository"
import { PrismaTalkThemeRepository } from "../../../src/repository/prisma/talk-theme-repository"
import { matchingRouter } from "../../../src/routes/matching-router"
import { attachErrorHandler, createTestApp } from "../helper"
import {
  cleanupTestData,
  cleanupTestRedis,
  disconnectTestDb,
  disconnectTestRedis,
  testPrisma,
} from "../setup"

const matchingSessionRepository = new PrismaMatchingSessionRepository(testPrisma)
const matchingReactionRepository = new PrismaMatchingReactionRepository(testPrisma)
const talkThemeRepository = new PrismaTalkThemeRepository(testPrisma)

const livekitClient: ILiveKitClient = {
  generateRoomToken: jest.fn(),
  publishData: jest.fn().mockResolvedValue(undefined),
}

const reactionSubmitController = new MatchingReactionSubmitController(
  livekitClient,
  matchingReactionRepository,
  matchingSessionRepository,
  talkThemeRepository,
)
const reactionsListController = new MatchingReactionsListController(
  matchingReactionRepository,
  matchingSessionRepository,
)

const app = createTestApp()
app.use(
  "/api/matching",
  matchingRouter({
    reactionsList: reactionsListController,
    reactionSubmit: reactionSubmitController,
  }),
)
attachErrorHandler(app)

const seedChoiceTheme = async (): Promise<{ choiceA: number; choiceB: number; themeId: number }> => {
  const theme = await testPrisma.talkTheme.create({
    data: {
      category: "MATCHING",
      duration: 20,
      sortOrder: 1,
      title: "好きな食べ物のジャンルは？",
      type: "CHOICE",
    },
  })
  const a = await testPrisma.talkThemeChoice.create({
    data: { emoji: "🍣", label: "和食", sortOrder: 1, themeId: theme.id },
  })
  const b = await testPrisma.talkThemeChoice.create({
    data: { emoji: "🍝", label: "イタリアン", sortOrder: 2, themeId: theme.id },
  })
  return { choiceA: a.id, choiceB: b.id, themeId: theme.id }
}

const seedFreeTalkTheme = async (): Promise<number> => {
  const theme = await testPrisma.talkTheme.create({
    data: {
      category: "MATCHING",
      duration: 30,
      sortOrder: 10,
      title: "最近ハマっていることを教えて",
      type: "FREE_TALK",
    },
  })
  return theme.id
}

beforeEach(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  ;(livekitClient.publishData as jest.Mock).mockClear()
  ;(livekitClient.publishData as jest.Mock).mockResolvedValue(undefined)
})

afterAll(async () => {
  await cleanupTestData()
  await cleanupTestRedis()
  await disconnectTestDb()
  await disconnectTestRedis()
})

describe("POST /api/matching/sessions/:id/reaction", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).post("/api/matching/sessions/1/reaction").send({
      choice_id: 1,
      round_number: 1,
      theme_id: 1,
    })
    expect(res.status).toBe(401)
  })

  it("body 不正 → 400", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post("/api/matching/sessions/1/reaction")
      .set("Authorization", `Bearer ${token}`)
      .send({})

    expect(res.status).toBe(400)
  })

  it("自分が先に POST → 200 + matched=null + DB に保存される", async () => {
    const { choiceA, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react1",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: choiceA, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(200)
    expect(res.body).toEqual({
      matched: null,
      my_choice: null,
      peer_choice: null,
      reaction_id: expect.any(Number),
    })

    const saved = await testPrisma.matchingReaction.findUnique({
      where: {
        sessionId_userId_roundNumber: {
          roundNumber: 1,
          sessionId: session.id,
          userId: me.id,
        },
      },
    })
    expect(saved).toMatchObject({
      choiceId: choiceA,
      roundNumber: 1,
      themeId,
      userId: me.id,
    })
    expect(livekitClient.publishData).not.toHaveBeenCalled()
  })

  it("両者一致 → 200 + matched=true + publishData 呼び出し", async () => {
    const { choiceA, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react2",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    /** 相手は先に同じ選択肢で回答済 */
    await testPrisma.matchingReaction.create({
      data: {
        choiceId: choiceA,
        roundNumber: 1,
        sessionId: session.id,
        themeId,
        userId: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: choiceA, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      matched: true,
      my_choice: { id: choiceA, label: "和食" },
      peer_choice: { id: choiceA, label: "和食" },
    })
    expect(livekitClient.publishData).toHaveBeenCalledWith(
      expect.objectContaining({
        roomName: "matching:react2",
        topic: "matching:reaction_match",
      }),
    )
  })

  it("CHOICE で choice_id=null → 400", async () => {
    const { themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react3",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: null, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(400)
  })

  it("FREE_TALK で choice_id=null OK → 200 + matched=null", async () => {
    const themeId = await seedFreeTalkTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react4",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: null, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(200)
    expect(res.body.matched).toBeNull()
  })

  it("同 round 2 度目 → 409", async () => {
    const { choiceA, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react5",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    await testPrisma.matchingReaction.create({
      data: {
        choiceId: choiceA,
        roundNumber: 1,
        sessionId: session.id,
        themeId,
        userId: me.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: choiceA, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(409)
  })

  it("非参加者 → 403", async () => {
    const { choiceA, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const u1 = await testPrisma.user.create({
      data: { email: "u1@example.com", isOnboarded: true, name: "U1" },
    })
    const u2 = await testPrisma.user.create({
      data: { email: "u2@example.com", isOnboarded: true, name: "U2" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:react6",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: choiceA, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(403)
  })

  it("ENDED → 410", async () => {
    const { choiceA, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        endedAt: new Date(),
        endReason: "MANUAL",
        livekitRoomName: "matching:react7",
        status: "ENDED",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .post(`/api/matching/sessions/${session.id}/reaction`)
      .set("Authorization", `Bearer ${token}`)
      .send({ choice_id: choiceA, round_number: 1, theme_id: themeId })

    expect(res.status).toBe(410)
  })
})

describe("GET /api/matching/sessions/:id/reactions", () => {
  it("認証なし → 401", async () => {
    const res = await request(app).get("/api/matching/sessions/1/reactions")
    expect(res.status).toBe(401)
  })

  it("非参加者 → 403", async () => {
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const u1 = await testPrisma.user.create({
      data: { email: "u1@example.com", isOnboarded: true, name: "U1" },
    })
    const u2 = await testPrisma.user.create({
      data: { email: "u2@example.com", isOnboarded: true, name: "U2" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:rr-403",
        status: "ACTIVE",
        user1Id: u1.id,
        user2Id: u2.id,
      },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/matching/sessions/${session.id}/reactions`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(403)
  })

  it("複数 round 集約 → round 昇順で正しい is_match / my_choice / peer_choice", async () => {
    const { choiceA, choiceB, themeId } = await seedChoiceTheme()
    const me = await testPrisma.user.create({
      data: { email: "me@example.com", isOnboarded: true, name: "Me" },
    })
    const peer = await testPrisma.user.create({
      data: { email: "peer@example.com", isOnboarded: true, name: "Peer" },
    })
    const session = await testPrisma.matchingSession.create({
      data: {
        livekitRoomName: "matching:rr-list",
        startedAt: new Date(),
        status: "ACTIVE",
        user1Id: me.id,
        user2Id: peer.id,
      },
    })

    /** round1: 一致 */
    await testPrisma.matchingReaction.createMany({
      data: [
        { choiceId: choiceA, roundNumber: 1, sessionId: session.id, themeId, userId: me.id },
        { choiceId: choiceA, roundNumber: 1, sessionId: session.id, themeId, userId: peer.id },
      ],
    })
    /** round2: 不一致 */
    await testPrisma.matchingReaction.createMany({
      data: [
        { choiceId: choiceB, roundNumber: 2, sessionId: session.id, themeId, userId: me.id },
        { choiceId: choiceA, roundNumber: 2, sessionId: session.id, themeId, userId: peer.id },
      ],
    })
    /** round3: 自分のみ */
    await testPrisma.matchingReaction.create({
      data: { choiceId: choiceA, roundNumber: 3, sessionId: session.id, themeId, userId: me.id },
    })
    const token = generateAccessToken(me.id)

    const res = await request(app)
      .get(`/api/matching/sessions/${session.id}/reactions`)
      .set("Authorization", `Bearer ${token}`)

    expect(res.status).toBe(200)
    expect(res.body.rounds).toEqual([
      {
        is_match: true,
        my_choice: { id: choiceA, label: "和食" },
        peer_choice: { id: choiceA, label: "和食" },
        round_number: 1,
        theme: { id: themeId, title: "好きな食べ物のジャンルは？", type: "CHOICE" },
      },
      {
        is_match: false,
        my_choice: { id: choiceB, label: "イタリアン" },
        peer_choice: { id: choiceA, label: "和食" },
        round_number: 2,
        theme: { id: themeId, title: "好きな食べ物のジャンルは？", type: "CHOICE" },
      },
      {
        is_match: false,
        my_choice: { id: choiceA, label: "和食" },
        peer_choice: null,
        round_number: 3,
        theme: { id: themeId, title: "好きな食べ物のジャンルは？", type: "CHOICE" },
      },
    ])
  })
})
