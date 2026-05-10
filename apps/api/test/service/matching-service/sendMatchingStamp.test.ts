import { ILiveKitClient } from "../../../src/client/livekit"
import {
  ItemRepository,
  MatchingSessionRepository,
  UserInventoryRepository,
} from "../../../src/repository/prisma"
import { RateLimitRedisRepository } from "../../../src/repository/redis"
import { sendMatchingStamp } from "../../../src/service/matching-service"
import { MatchingSession, StampForMatching } from "../../../src/types/domain"

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

const buildFreeStamp = (overrides?: Partial<StampForMatching>): StampForMatching => ({
  animationType: "FLOAT",
  emoji: "🎉",
  id: 10,
  isPremium: false,
  name: "拍手",
  ...overrides,
})

describe("sendMatchingStamp", () => {
  const buildDeps = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markActive: jest.fn(),
      markEnded: jest.fn(),
    }
    const itemRepository: ItemRepository = {
      findActiveStampForMatching: jest.fn(),
    }
    const userInventoryRepository: UserInventoryRepository = {
      hasItem: jest.fn(),
    }
    const rateLimitRedisRepository: RateLimitRedisRepository = {
      incrementWithLimit: jest.fn().mockResolvedValue(true),
    }
    const livekitClient: ILiveKitClient = {
      generateRoomToken: jest.fn(),
      publishData: jest.fn().mockResolvedValue(undefined),
    }
    return {
      client: { livekitClient },
      repo: {
        itemRepository,
        matchingSessionRepository,
        rateLimitRedisRepository,
        userInventoryRepository,
      },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("free スタンプ → ok / Data Channel publish される", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.itemRepository.findActiveStampForMatching as jest.Mock).mockResolvedValue(
      buildFreeStamp(),
    )

    const before = Date.now()
    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toMatchObject({
        animationType: "FLOAT",
        emoji: "🎉",
        itemId: 10,
      })
      expect(result.value.deliveredAt).toBeGreaterThanOrEqual(before)
    }
    expect(d.client.livekitClient.publishData).toHaveBeenCalledWith({
      payload: {
        animation_type: "FLOAT",
        emoji: "🎉",
        item_id: 10,
        sender_id: 1,
      },
      roomName: "matching:100",
      topic: "matching:stamp",
    })
    expect(d.repo.userInventoryRepository.hasItem).not.toHaveBeenCalled()
  })

  it("premium スタンプで所持あり → ok", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.itemRepository.findActiveStampForMatching as jest.Mock).mockResolvedValue(
      buildFreeStamp({ isPremium: true }),
    )
    ;(d.repo.userInventoryRepository.hasItem as jest.Mock).mockResolvedValue(true)

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
    expect(d.repo.userInventoryRepository.hasItem).toHaveBeenCalledWith(1, 10)
    expect(d.client.livekitClient.publishData).toHaveBeenCalled()
  })

  it("premium スタンプで所持なし → 403 / publish 呼ばれない", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.itemRepository.findActiveStampForMatching as jest.Mock).mockResolvedValue(
      buildFreeStamp({ isPremium: true }),
    )
    ;(d.repo.userInventoryRepository.hasItem as jest.Mock).mockResolvedValue(false)

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
    expect(d.client.livekitClient.publishData).not.toHaveBeenCalled()
  })

  it("非 STAMP / 非 MATCHING（findActiveStampForMatching が null）→ 400", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.itemRepository.findActiveStampForMatching as jest.Mock).mockResolvedValue(null)

    const result = await sendMatchingStamp(
      { itemId: 999, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(400)
      expect(result.error.type).toBe("BAD_REQUEST")
    }
  })

  it("レート制限超過 → 429 / item 検証も publish もスキップ", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.rateLimitRedisRepository.incrementWithLimit as jest.Mock).mockResolvedValue(false)

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(429)
      expect(result.error.type).toBe("TOO_MANY_REQUESTS")
    }
    expect(d.repo.itemRepository.findActiveStampForMatching).not.toHaveBeenCalled()
    expect(d.client.livekitClient.publishData).not.toHaveBeenCalled()
  })

  it("非参加者 → 403", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 99 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(403)
    expect(d.repo.rateLimitRedisRepository.incrementWithLimit).not.toHaveBeenCalled()
  })

  it("ENDED → 410", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "ENDED" }),
    )

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(410)
      expect(result.error.type).toBe("GONE")
    }
  })

  it("セッション無し → 404", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 999, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.statusCode).toBe(404)
  })

  it("publishData が失敗してもレスポンスは ok（best-effort）", async () => {
    const d = buildDeps()
    ;(d.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(buildSession())
    ;(d.repo.itemRepository.findActiveStampForMatching as jest.Mock).mockResolvedValue(
      buildFreeStamp(),
    )
    ;(d.client.livekitClient.publishData as jest.Mock).mockRejectedValue(new Error("LiveKit down"))

    const result = await sendMatchingStamp(
      { itemId: 10, sessionId: 100, userId: 1 },
      d.repo,
      d.client,
    )

    expect(result.ok).toBe(true)
  })
})
