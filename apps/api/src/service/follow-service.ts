import { logger } from "../log"
import type {
  BlockRepository,
  FollowListEntry,
  FollowListRepository,
  FollowRepository,
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
 * フォロー作成。
 *
 * - 自分自身は 400（spec: 自分自身のフォローは拒否）
 * - フォロー対象が存在しない → 404
 * - 双方向どちらかでブロック関係があれば 400（spec: ブロック中は不可）
 * - 既にフォロー済 → 409（spec: 重複は 409）
 *
 * 上記の前段チェックを通過してから create する。レース条件で create が unique 違反になった場合は
 * Prisma の P2002 を catch して 409 に変換する。
 */
export const followUser = async (
  input: { followeeId: number; followerId: number },
  repo: {
    blockRepository: BlockRepository
    followRepository: FollowRepository
    userRepository: UserRepository
  },
): Promise<Result<{ followeeId: number; followerId: number }>> => {
  logger.debug("FollowService: followUser", input)

  if (input.followerId === input.followeeId) {
    return err(badRequestError("Cannot follow yourself"))
  }

  const followee = await repo.userRepository.findById(input.followeeId)
  if (!followee) return err(notFoundError("User not found"))

  const blocked = await repo.blockRepository.existsBetween(input.followerId, input.followeeId)
  if (blocked) return err(badRequestError("Blocked relationship exists"))

  const already = await repo.followRepository.exists({
    followeeId: input.followeeId,
    followerId: input.followerId,
  })
  if (already) return err(conflictError("Already following"))

  try {
    await repo.followRepository.create({
      followeeId: input.followeeId,
      followerId: input.followerId,
    })
  } catch (e: unknown) {
    /** create と exists の間にレースがあった場合の防御。P2002 (unique 違反) を 409 に変換 */
    if (typeof e === "object" && e !== null && "code" in e && (e as { code: string }).code === "P2002") {
      return err(conflictError("Already following"))
    }
    throw e
  }

  return ok({ followeeId: input.followeeId, followerId: input.followerId })
}

/**
 * フォロー解除。元々フォローしていなくても 200 を返す（冪等）。
 * 自分自身の解除は前段で 400（spec の対称性: follow と同じ条件）。
 */
export const unfollowUser = async (
  input: { followeeId: number; followerId: number },
  repo: { followRepository: FollowRepository },
): Promise<Result<void>> => {
  logger.debug("FollowService: unfollowUser", input)

  if (input.followerId === input.followeeId) {
    return err(badRequestError("Cannot unfollow yourself"))
  }

  await repo.followRepository.delete({
    followeeId: input.followeeId,
    followerId: input.followerId,
  })
  return ok(undefined)
}

/**
 * フォロワー一覧取得。
 * - 対象ユーザーが存在しない → 404
 * - limit + 1 件取得する戦略は使わず、`take=limit` で取り、`limit` 件揃った場合のみ末尾 follow.id を
 *   `nextCursor` に返す。`limit` 未満なら次ページなしと判断（末尾エッジ）。
 *   ※「次ページがあるかは余分に 1 件取って判定」の方が厳密だが、エンドユーザの一覧画面では
 *   1 件多い空振りより「最後の画面で末尾を再 fetch して 0 件」の方がシンプル。今後 UI で
 *   厳密性が必要になった時に limit+1 戦略に切り替える。
 */
export const getFollowers = async (
  input: { cursor: number | undefined; limit: number; targetUserId: number },
  repo: {
    followListRepository: FollowListRepository
    userRepository: UserRepository
  },
): Promise<Result<{ entries: FollowListEntry[]; nextCursor: number | null }>> => {
  logger.debug("FollowService: getFollowers", input)

  const target = await repo.userRepository.findById(input.targetUserId)
  if (!target) return err(notFoundError("User not found"))

  const entries = await repo.followListRepository.findFollowers(input.targetUserId, {
    cursor: input.cursor,
    limit: input.limit,
  })
  const nextCursor = entries.length === input.limit ? entries[entries.length - 1].followId : null
  return ok({ entries, nextCursor })
}

/**
 * フォロー中一覧取得。挙動は `getFollowers` と対称（follower_id = userId 側を引く）。
 */
export const getFollowing = async (
  input: { cursor: number | undefined; limit: number; targetUserId: number },
  repo: {
    followListRepository: FollowListRepository
    userRepository: UserRepository
  },
): Promise<Result<{ entries: FollowListEntry[]; nextCursor: number | null }>> => {
  logger.debug("FollowService: getFollowing", input)

  const target = await repo.userRepository.findById(input.targetUserId)
  if (!target) return err(notFoundError("User not found"))

  const entries = await repo.followListRepository.findFollowing(input.targetUserId, {
    cursor: input.cursor,
    limit: input.limit,
  })
  const nextCursor = entries.length === input.limit ? entries[entries.length - 1].followId : null
  return ok({ entries, nextCursor })
}
