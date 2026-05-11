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

/**
 * フォロー一覧用エントリ（follow row の id と相手ユーザーの軽量プロフィール）。
 * cursor ページネーション用に `followId` を付ける。
 */
export type FollowListEntry = {
    avatarUrl: string | null
    bio: string | null
    followId: number
    id: number
    name: string | null
}

/**
 * フォロー一覧取得用 Repository。
 *
 * - `findFollowers(userId, opts)`: 指定ユーザーをフォローしている人の一覧
 * - `findFollowing(userId, opts)`: 指定ユーザーがフォローしている人の一覧
 *
 * cursor は follow.id 降順を前提とし、`cursor` 未指定の場合は最新から、指定された場合は
 * その follow.id 未満を返す。並び順は follow.id DESC（新しくフォローした関係が先頭）。
 *
 * 既存利用箇所への影響を抑えるため `FollowRepository` から分離している。
 */
export interface FollowListRepository {
    findFollowers(
        userId: number,
        opts: { cursor: number | undefined; limit: number },
    ): Promise<FollowListEntry[]>
    findFollowing(
        userId: number,
        opts: { cursor: number | undefined; limit: number },
    ): Promise<FollowListEntry[]>
}

export class PrismaFollowRepository
implements FollowRepository, FollowBidirectionalRepository, FollowListRepository {
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

  findFollowers = async (
    userId: number,
    opts: { cursor: number | undefined; limit: number },
  ): Promise<FollowListEntry[]> => {
    /**
     * followee_id = userId（=「userId をフォローしている人」）。
     * follower 側のユーザー軽量プロフィールを返却する。
     */
    const rows = await this._prisma.follow.findMany({
      orderBy: { id: "desc" },
      select: {
        follower: {
          select: {
            avatarUrl: true,
            bio: true,
            id: true,
            name: true,
          },
        },
        id: true,
      },
      take: opts.limit,
      where: {
        followeeId: userId,
        ...(opts.cursor !== undefined ? { id: { lt: opts.cursor } } : {}),
      },
    })
    return rows.map((row) => ({
      avatarUrl: row.follower.avatarUrl,
      bio: row.follower.bio,
      followId: row.id,
      id: row.follower.id,
      name: row.follower.name,
    }))
  }

  findFollowing = async (
    userId: number,
    opts: { cursor: number | undefined; limit: number },
  ): Promise<FollowListEntry[]> => {
    /**
     * follower_id = userId（=「userId がフォローしている人」）。
     * followee 側のユーザー軽量プロフィールを返却する。
     */
    const rows = await this._prisma.follow.findMany({
      orderBy: { id: "desc" },
      select: {
        followee: {
          select: {
            avatarUrl: true,
            bio: true,
            id: true,
            name: true,
          },
        },
        id: true,
      },
      take: opts.limit,
      where: {
        followerId: userId,
        ...(opts.cursor !== undefined ? { id: { lt: opts.cursor } } : {}),
      },
    })
    return rows.map((row) => ({
      avatarUrl: row.followee.avatarUrl,
      bio: row.followee.bio,
      followId: row.id,
      id: row.followee.id,
      name: row.followee.name,
    }))
  }
}
