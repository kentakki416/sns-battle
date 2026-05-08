import { HobbyRepository } from "../../../src/repository/prisma/hobby-repository"
import { getActiveHobbies } from "../../../src/service/hobby-service"
import { Hobby } from "../../../src/types/domain"

const mockFindActiveAll = jest.fn<Promise<Hobby[]>, []>()
const mockHobbyRepository: HobbyRepository = {
  findActiveAll: mockFindActiveAll,
  findActiveByIds: jest.fn(),
}

describe("getActiveHobbies", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("有効な趣味リストを返す", async () => {
    const hobbies: Hobby[] = [
      { id: 1, name: "音楽鑑賞", sortOrder: 1 },
      { id: 5, name: "ゲーム", sortOrder: 5 },
    ]
    mockFindActiveAll.mockResolvedValue(hobbies)

    const result = await getActiveHobbies({ hobbyRepository: mockHobbyRepository })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(hobbies)
    }
    expect(mockFindActiveAll).toHaveBeenCalledTimes(1)
  })

  it("マスターが空の場合、空配列を返す", async () => {
    mockFindActiveAll.mockResolvedValue([])

    const result = await getActiveHobbies({ hobbyRepository: mockHobbyRepository })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual([])
    }
  })

  it("DB エラー時は throw（業務エラーではない）", async () => {
    mockFindActiveAll.mockRejectedValue(new Error("DB error"))

    await expect(getActiveHobbies({ hobbyRepository: mockHobbyRepository })).rejects.toThrow()
  })
})
