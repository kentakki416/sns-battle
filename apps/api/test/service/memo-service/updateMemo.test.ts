import { MemoRepository, UpdateMemoInput } from "../../../src/repository/prisma/memo-repository"
import { updateMemo } from "../../../src/service/memo-service"
import { Memo } from "../../../src/types/domain"

// モック
const mockFindById = jest.fn<Promise<Memo | null>, [number]>()
const mockUpdate = jest.fn<Promise<Memo>, [number, UpdateMemoInput]>()

const mockMemoRepository: MemoRepository = {
  create: jest.fn(),
  deleteById: jest.fn(),
  findAll: jest.fn(),
  findById: mockFindById,
  update: mockUpdate,
}

describe("updateMemo", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("メモが存在する場合、更新して ok: true で返す", async () => {
    // Arrange
    const existingMemo: Memo = {
      body: "Old Body",
      createdAt: new Date(),
      id: 1,
      title: "Old Title",
      updatedAt: new Date(),
    }

    const input: UpdateMemoInput = {
      body: "Updated Body",
      title: "Updated Title",
    }

    const updatedMemo: Memo = {
      body: "Updated Body",
      createdAt: existingMemo.createdAt,
      id: 1,
      title: "Updated Title",
      updatedAt: new Date(),
    }

    mockFindById.mockResolvedValue(existingMemo)
    mockUpdate.mockResolvedValue(updatedMemo)

    // Act
    const result = await updateMemo(1, input, { memoRepository: mockMemoRepository })

    // Assert
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value).toEqual(updatedMemo)
    }
    expect(mockFindById).toHaveBeenCalledWith(1)
    expect(mockUpdate).toHaveBeenCalledWith(1, input)
  })

  it("メモが存在しない場合、ok: false と NOT_FOUND エラーを返す", async () => {
    // Arrange
    const input: UpdateMemoInput = {
      body: "Updated Body",
      title: "Updated Title",
    }

    mockFindById.mockResolvedValue(null)

    // Act
    const result = await updateMemo(999, input, { memoRepository: mockMemoRepository })

    // Assert
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toMatchObject({
        statusCode: 404,
        type: "NOT_FOUND",
      })
    }
    expect(mockFindById).toHaveBeenCalledWith(999)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("データベースエラー時にエラーをスローする", async () => {
    // Arrange
    const input: UpdateMemoInput = {
      body: "Updated Body",
      title: "Updated Title",
    }

    const mockError = new Error("Database connection failed")
    mockFindById.mockRejectedValue(mockError)

    // Act & Assert
    await expect(updateMemo(1, input, { memoRepository: mockMemoRepository })).rejects.toThrow()
    expect(mockFindById).toHaveBeenCalledWith(1)
  })
})
