import { PrismaClient } from "../../prisma/generated/client"

import { TransactionContext } from "./transaction-runner"

/**
 * フォロー関係（follows）の Repository。
 *
 * Spec1 範囲では「フォロー作成 / 解除 / 存在確認」のみを提供する。一覧取得（followers / following）
 * は後続 step で追加する。
 */
export interface FollowRepository {
    /**
     * follower → followee の Follow row を作成する。既に存在する場合は Prisma の unique 制約違反
     * （P2002）が throw されるため、呼び出し側は事前 / 事後で 409 ハンドリングを行う。
     */
    create(input: { followeeId: number; followerId: number }): Promise<void>
    /**
     * follower → followee の Follow row を削除する。元々存在しなくてもエラーにしない（冪等）。
     */
    delete(input: { followeeId: number; followerId: number }): Promise<void>
    /** follower が followee をフォロー中か */
    exists(input: { followeeId: number; followerId: number }): Promise<boolean>
}

/**
 * フォロー関係の双方向削除専用 Repository。ブロック発行時の副作用として使う。
 *
 * 既存の `FollowRepository` 利用箇所（follow-service / follow tests / matching tests）に影響を与えないよう
 * 分離している。実装クラスは同じ `PrismaFollowRepository` で両方を満たす。
 */
export interface FollowBidirectionalRepository {
    /**
     * A→B と B→A の Follow row を双方向で削除する（冪等）。tx を渡せば呼び出し側のトランザクションに合流する。
     */
    deleteBidirectional(
        input: { userIdA: number; userIdB: number },
        tx?: TransactionContext,
    ): Promise<void>
}

export class PrismaFollowRepository implements FollowRepository, FollowBidirectionalRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  create = async (input: { followeeId: number; followerId: number }): Promise<void> => {
    await this._prisma.follow.create({
      data: {
        followeeId: input.followeeId,
        followerId: input.followerId,
      },
    })
  }

  delete = async (input: { followeeId: number; followerId: number }): Promise<void> => {
    /**
     * deleteMany は対象 0 件でも例外を投げないので冪等性を担保しやすい。
     * unique 制約 (followerId, followeeId) で 1 行に限定される。
     */
    await this._prisma.follow.deleteMany({
      where: {
        followeeId: input.followeeId,
        followerId: input.followerId,
      },
    })
  }

  deleteBidirectional = async (
    input: { userIdA: number; userIdB: number },
    tx?: TransactionContext,
  ): Promise<void> => {
    const client = tx ?? this._prisma
    await client.follow.deleteMany({
      where: {
        OR: [
          { followeeId: input.userIdB, followerId: input.userIdA },
          { followeeId: input.userIdA, followerId: input.userIdB },
        ],
      },
    })
  }

  exists = async (input: { followeeId: number; followerId: number }): Promise<boolean> => {
    const found = await this._prisma.follow.findFirst({
      where: {
        followeeId: input.followeeId,
        followerId: input.followerId,
      },
    })
    return found !== null
  }
}
