import { logger } from "../log"
import { HobbyRepository } from "../repository/prisma"
import { Hobby } from "../types/domain"
import { ok, Result } from "../types/result"

/**
 * 有効な趣味マスター一覧を sort_order 昇順で取得する。
 * 業務エラーを返さない（マスターは常に取得成功か DB 例外）ため Result 型は ok のみ。
 */
export const getActiveHobbies = async (
  repo: { hobbyRepository: HobbyRepository }
): Promise<Result<Hobby[]>> => {
  logger.debug("HobbyService: Fetching active hobbies")
  const hobbies = await repo.hobbyRepository.findActiveAll()
  return ok(hobbies)
}
