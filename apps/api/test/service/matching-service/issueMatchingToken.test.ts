import { ILiveKitClient } from "../../../src/client/livekit"
import { MatchingSessionRepository } from "../../../src/repository/prisma"
import { issueMatchingToken } from "../../../src/service/matching-service"
import { MatchingSession } from "../../../src/types/domain"

const buildSession = (overrides?: Partial<MatchingSession>): MatchingSession => ({
  createdAt: new Date(),
  endedAt: null,
  endReason: null,
  id: 10,
  livekitRoomName: "matching:10",
  startedAt: null,
  status: "COUNTDOWN",
  user1Id: 1,
  user2Id: 2,
  ...overrides,
})

describe("issueMatchingToken", () => {
  const buildDeps = () => {
    const matchingSessionRepository: MatchingSessionRepository = {
      create: jest.fn(),
      findActiveByUserId: jest.fn(),
      findById: jest.fn(),
      markEnded: jest.fn(),
    }
    const livekitClient: ILiveKitClient = {
      generateRoomToken: jest.fn(),
      publishData: jest.fn(),
    }
    return {
      client: { livekitClient, livekitUrl: "https://dummy.livekit.cloud" },
      repo: { matchingSessionRepository },
    }
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("参加者本人 → ok と LiveKit に渡した引数が期待どおり", async () => {
    const deps = buildDeps()
    const fixedNow = 1_700_000_000_000
    jest.spyOn(Date, "now").mockReturnValue(fixedNow)
    ;(deps.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ id: 10, livekitRoomName: "matching:10", user1Id: 1, user2Id: 2 }),
    )
    ;(deps.client.livekitClient.generateRoomToken as jest.Mock).mockResolvedValue("jwt-token")

    const result = await issueMatchingToken(
      { sessionId: 10, userId: 1 },
      deps.repo,
      deps.client,
    )

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual({
        expiresAt: Math.floor(fixedNow / 1000) + 3600,
        livekitUrl: "https://dummy.livekit.cloud",
        roomName: "matching:10",
        token: "jwt-token",
      })
    }
    expect(deps.client.livekitClient.generateRoomToken).toHaveBeenCalledWith({
      identity: "user:1",
      roomName: "matching:10",
      ttlSeconds: 3600,
    })

    jest.restoreAllMocks()
  })

  it("user2 でも 200 を返す", async () => {
    const deps = buildDeps()
    ;(deps.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )
    ;(deps.client.livekitClient.generateRoomToken as jest.Mock).mockResolvedValue("jwt-token")

    const result = await issueMatchingToken({ sessionId: 10, userId: 2 }, deps.repo, deps.client)

    expect(result.ok).toBe(true)
    expect(deps.client.livekitClient.generateRoomToken).toHaveBeenCalledWith(
      expect.objectContaining({ identity: "user:2" }),
    )
  })

  it("参加者でない → 403 FORBIDDEN", async () => {
    const deps = buildDeps()
    ;(deps.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ user1Id: 1, user2Id: 2 }),
    )

    const result = await issueMatchingToken({ sessionId: 10, userId: 99 }, deps.repo, deps.client)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(403)
      expect(result.error.type).toBe("FORBIDDEN")
    }
    expect(deps.client.livekitClient.generateRoomToken).not.toHaveBeenCalled()
  })

  it("ENDED セッション → 410 GONE", async () => {
    const deps = buildDeps()
    ;(deps.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(
      buildSession({ status: "ENDED", user1Id: 1, user2Id: 2 }),
    )

    const result = await issueMatchingToken({ sessionId: 10, userId: 1 }, deps.repo, deps.client)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(410)
      expect(result.error.type).toBe("GONE")
    }
    expect(deps.client.livekitClient.generateRoomToken).not.toHaveBeenCalled()
  })

  it("存在しないセッション → 404 NOT_FOUND", async () => {
    const deps = buildDeps()
    ;(deps.repo.matchingSessionRepository.findById as jest.Mock).mockResolvedValue(null)

    const result = await issueMatchingToken({ sessionId: 999, userId: 1 }, deps.repo, deps.client)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.statusCode).toBe(404)
      expect(result.error.type).toBe("NOT_FOUND")
    }
    expect(deps.client.livekitClient.generateRoomToken).not.toHaveBeenCalled()
  })
})
