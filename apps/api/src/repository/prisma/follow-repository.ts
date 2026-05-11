import { PrismaClient } from "../../prisma/generated/client"

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
    create(input: { followerId: number; followeeId: number }): Promise<void>
    /**
     * follower → followee の Follow row を削除する。元々存在しなくてもエラーにしない（冪等）。
     */
    delete(input: { followerId: number; followeeId: number }): Promise<void>
    /** follower が followee をフォロー中か */
    exists(input: { followerId: number; followeeId: number }): Promise<boolean>
}

export class PrismaFollowRepository implements FollowRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  create = async (input: { followerId: number; followeeId: number }): Promise<void> => {
    await this._prisma.follow.create({
      data: {
        followeeId: input.followeeId,
        followerId: input.followerId,
      },
    })
  }

  delete = async (input: { followerId: number; followeeId: number }): Promise<void> => {
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

  exists = async (input: { followerId: number; followeeId: number }): Promise<boolean> => {
    const found = await this._prisma.follow.findFirst({
      where: {
        followeeId: input.followeeId,
        followerId: input.followerId,
      },
    })
    return found !== null
  }
}
