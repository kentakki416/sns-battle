import { ItemRepository } from "../../../src/repository/prisma"
import { getMatchingStamps } from "../../../src/service/matching-service"
import { StampForMatching } from "../../../src/types/domain"

const buildRepo = () => {
  const itemRepository: ItemRepository = {
    findActiveStampForMatching: jest.fn(),
    findManyActiveStampsForMatching: jest.fn(),
  }
  return { itemRepository }
}

const sampleStamp = (overrides?: Partial<StampForMatching>): StampForMatching => ({
  animationType: "FLOAT",
  emoji: "👏",
  id: 1,
  isPremium: false,
  name: "拍手",
  ...overrides,
})

describe("getMatchingStamps", () => {
  beforeEach(() => jest.clearAllMocks())

  it("リポジトリの返り値をそのまま ok で返す", async () => {
    const repo = buildRepo()
    const stamps = [
      sampleStamp({ emoji: "👏", id: 1, name: "拍手" }),
      sampleStamp({ emoji: "❤️", id: 2, name: "ハート" }),
    ]
    ;(repo.itemRepository.findManyActiveStampsForMatching as jest.Mock).mockResolvedValue(stamps)

    const result = await getMatchingStamps(repo)

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.stamps).toEqual(stamps)
    }
    expect(repo.itemRepository.findManyActiveStampsForMatching).toHaveBeenCalledTimes(1)
  })

  it("空配列でも ok で返る", async () => {
    const repo = buildRepo()
    ;(repo.itemRepository.findManyActiveStampsForMatching as jest.Mock).mockResolvedValue([])
    const result = await getMatchingStamps(repo)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.stamps).toEqual([])
    }
  })
})
