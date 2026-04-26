import { MemoRepository } from "../../../src/repository/prisma/memo-repository"
import { getMemoById } from "../../../src/service/memo-service"
import { Memo } from "../../../src/types/domain"

// モック
const mockFindById = jest.fn<Promise<Memo | null>, [number]>()

const mockMemoRepository: MemoRepository = {
  create: jest.fn(),
  deleteById: jest.fn(),
  findAll: jest.fn(),
  findById: mockFindById,
  update: jest.fn(),
}

describe("getMemoById", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("メモが存在する場合、ok: true とメモを返す", async () => {
    // Arrange
    const mockMemo: Memo = {
      body: "Test Body",
      createdAt: new Date(),
      id: 1,
      title: "Test Title",
      updatedAt: new Date(),
    }

    mockFindById.mockResolvedValue(mockMemo)

    // Act
    const result = await getMemoById(1, mockMemoRepository)

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(mockMemo)
    }
    expect(mockFindById).toHaveBeenCalledWith(1)
    expect(mockFindById).toHaveBeenCalledTimes(1)
  })

  it("メモが存在しない場合、ok: false と NOT_FOUND エラーを返す", async () => {
    // Arrange
    mockFindById.mockResolvedValue(null)

    // Act
    const result = await getMemoById(999, mockMemoRepository)

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.type).toBe("NOT_FOUND")
      expect(result.error.statusCode).toBe(404)
      expect(result.error.message).toBe("Memo not found")
    }
    expect(mockFindById).toHaveBeenCalledWith(999)
    expect(mockFindById).toHaveBeenCalledTimes(1)
  })

  it("データベースエラー時にエラーをスローする", async () => {
    // Arrange
    const mockError = new Error("Database connection failed")
    mockFindById.mockRejectedValue(mockError)

    // Act & Assert
    await expect(getMemoById(1, mockMemoRepository)).rejects.toThrow(
      "Database connection failed"
    )
    expect(mockFindById).toHaveBeenCalledWith(1)
  })
})
