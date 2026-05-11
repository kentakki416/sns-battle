import { logger } from "../log"
import type {
  BlockMutationRepository,
  FollowBidirectionalRepository,
  TransactionRunner,
  UserRepository,
} from "../repository/prisma"
import {
  badRequestError,
  conflictError,
  err,
  notFoundError,
  ok,
  type Result,
} from "../types/result"

/**
 * ブロック作成。
 *
 * - 自分自身は 400（spec: 自分自身のブロックは拒否）
 * - 対象ユーザーが存在しない → 404
 * - 既にブロック済（自分→対象）→ 409
 * - 上記の前段チェック通過後にトランザクション内で
 *   block create + 双方向 follow 削除を atomic に実行する。
 * - レース条件で create が unique 違反になった場合は P2002 を catch して 409 に変換する。
 */
export const blockUser = async (
  input: { blockedId: number; blockerId: number },
  repo: {
    blockMutationRepository: BlockMutationRepository
    followBidirectionalRepository: FollowBidirectionalRepository
    transactionRunner: TransactionRunner
    userRepository: UserRepository
  },
): Promise<Result<{ blockedId: number; blockerId: number }>> => {
  logger.debug("BlockService: blockUser", input)

  if (input.blockerId === input.blockedId) {
    return err(badRequestError("Cannot block yourself"))
  }

  const target = await repo.userRepository.findById(input.blockedId)
  if (!target) return err(notFoundError("User not found"))

  const already = await repo.blockMutationRepository.exists({
    blockedId: input.blockedId,
    blockerId: input.blockerId,
  })
  if (already) return err(conflictError("Already blocking"))

  try {
    await repo.transactionRunner.run(async (tx) => {
      await repo.blockMutationRepository.create(
        { blockedId: input.blockedId, blockerId: input.blockerId },
        tx,
      )
      /**
       * spec: ブロック発行時に既存のフォロー関係を双方向で削除する。
       * blocker→blocked と blocked→blocker の双方とも消す。
       */
      await repo.followBidirectionalRepository.deleteBidirectional(
        { userIdA: input.blockerId, userIdB: input.blockedId },
        tx,
      )
    })
  } catch (e: unknown) {
    /** create と exists の間にレースがあった場合の防御。P2002 (unique 違反) を 409 に変換 */
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return err(conflictError("Already blocking"))
    }
    throw e
  }

  return ok({ blockedId: input.blockedId, blockerId: input.blockerId })
}

/**
 * ブロック解除。元々ブロックしていなくても 200 を返す（冪等）。
 * 自分自身の解除は前段で 400（spec の対称性: block と同じ条件）。
 */
export const unblockUser = async (
  input: { blockedId: number; blockerId: number },
  repo: { blockMutationRepository: BlockMutationRepository },
): Promise<Result<void>> => {
  logger.debug("BlockService: unblockUser", input)

  if (input.blockerId === input.blockedId) {
    return err(badRequestError("Cannot unblock yourself"))
  }

  await repo.blockMutationRepository.delete({
    blockedId: input.blockedId,
    blockerId: input.blockerId,
  })
  return ok(undefined)
}
