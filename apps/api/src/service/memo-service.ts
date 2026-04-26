import { logger } from "../log"
import { CreateMemoInput, MemoRepository, UpdateMemoInput } from "../repository/prisma"
import { Memo } from "../types/domain"
import { err, notFoundError, ok, Result } from "../types/result"

/**
 * メモ一覧を取得
 */
export const getAllMemos = async (
  memoRepository: MemoRepository
): Promise<Result<Memo[]>> => {
  logger.debug("MemoService: Fetching all memos")
  const memos = await memoRepository.findAll()
  logger.debug("MemoService: Memos fetched", { count: memos.length })
  return ok(memos)
}

/**
 * メモをIDで取得
 */
export const getMemoById = async (
  id: number,
  memoRepository: MemoRepository
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Fetching memo by ID", { id })
  const memo = await memoRepository.findById(id)
  if (!memo) {
    logger.debug("MemoService: Memo not found", { id })
    return err(notFoundError("Memo not found"))
  }
  return ok(memo)
}

/**
 * メモを作成
 */
export const createMemo = async (
  data: CreateMemoInput,
  memoRepository: MemoRepository
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Creating memo", { title: data.title })
  const memo = await memoRepository.create(data)
  logger.debug("MemoService: Memo created", { id: memo.id })
  return ok(memo)
}

/**
 * メモを更新
 */
export const updateMemo = async (
  id: number,
  data: UpdateMemoInput,
  memoRepository: MemoRepository
): Promise<Result<Memo>> => {
  logger.debug("MemoService: Updating memo", { id })
  const existing = await memoRepository.findById(id)
  if (!existing) {
    logger.debug("MemoService: Memo not found for update", { id })
    return err(notFoundError("Memo not found"))
  }
  const memo = await memoRepository.update(id, data)
  logger.debug("MemoService: Memo updated", { id: memo.id })
  return ok(memo)
}

/**
 * メモを削除
 */
export const deleteMemo = async (
  id: number,
  memoRepository: MemoRepository
): Promise<Result<{ deleted: true }>> => {
  logger.debug("MemoService: Deleting memo", { id })
  const existing = await memoRepository.findById(id)
  if (!existing) {
    logger.debug("MemoService: Memo not found for deletion", { id })
    return err(notFoundError("Memo not found"))
  }
  await memoRepository.deleteById(id)
  logger.debug("MemoService: Memo deleted", { id })
  return ok({ deleted: true })
}
