import { PrismaClient } from "../../prisma/generated/client"

import { TransactionContext } from "./transaction-runner"

/**
 * ブロック関係（blocks）の Repository（クエリ専用）。
 *
 * マッチング・フォロー前段で双方向のブロック関係を検出するのに使う。書き込み系は `BlockMutationRepository`
 * に分離している（既存利用箇所の mock 形状に影響を与えないため）。
 */
export interface BlockRepository {
    /** A→B または B→A の少なくとも 1 件のブロック関係があれば true */
    existsBetween(userIdA: number, userIdB: number): Promise<boolean>
    /**
     * 指定ユーザーとブロック関係（双方向）にある全ユーザー id を返す。
     * マッチング多段照合で「ブロック相手をスキップ」する際に一括取得して使う。
     */
    findBlockedUserIds(userId: number): Promise<Set<number>>
}

/**
 * ブロック関係の作成 / 削除 / 存在確認 Repository。POST/DELETE /api/users/:id/block で使う。
 * create は spec 上、既存 follow 関係を双方向で削除する必要があるため tx を受け取れる。
 */
export interface BlockMutationRepository {
    /**
     * blocker → blocked の Block row を作成する。既に存在する場合は P2002 を throw する。
     * tx 渡しで Service 層のトランザクションに合流できる（follow の双方向削除と atomic にするため）。
     */
    create(input: { blockedId: number; blockerId: number }, tx?: TransactionContext): Promise<void>
    /**
     * blocker → blocked の Block row を削除する。元々存在しなくてもエラーにしない（冪等）。
     */
    delete(input: { blockedId: number; blockerId: number }): Promise<void>
    /** blocker が blocked をブロック中か（片方向） */
    exists(input: { blockedId: number; blockerId: number }): Promise<boolean>
}

export class PrismaBlockRepository implements BlockRepository, BlockMutationRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  create = async (
    input: { blockedId: number; blockerId: number },
    tx?: TransactionContext,
  ): Promise<void> => {
    const client = tx ?? this._prisma
    await client.block.create({
      data: {
        blockedId: input.blockedId,
        blockerId: input.blockerId,
      },
    })
  }

  delete = async (input: { blockedId: number; blockerId: number }): Promise<void> => {
    /**
     * deleteMany は対象 0 件でも例外を投げないので冪等性を担保しやすい。
     * unique 制約 (blockerId, blockedId) で 1 行に限定される。
     */
    await this._prisma.block.deleteMany({
      where: {
        blockedId: input.blockedId,
        blockerId: input.blockerId,
      },
    })
  }

  exists = async (input: { blockedId: number; blockerId: number }): Promise<boolean> => {
    const found = await this._prisma.block.findFirst({
      where: {
        blockedId: input.blockedId,
        blockerId: input.blockerId,
      },
    })
    return found !== null
  }

  existsBetween = async (userIdA: number, userIdB: number): Promise<boolean> => {
    const found = await this._prisma.block.findFirst({
      where: {
        OR: [
          { blockedId: userIdB, blockerId: userIdA },
          { blockedId: userIdA, blockerId: userIdB },
        ],
      },
    })
    return found !== null
  }

  findBlockedUserIds = async (userId: number): Promise<Set<number>> => {
    const rows = await this._prisma.block.findMany({
      select: { blockedId: true, blockerId: true },
      where: {
        OR: [{ blockerId: userId }, { blockedId: userId }],
      },
    })
    const ids = new Set<number>()
    for (const row of rows) {
      if (row.blockerId !== userId) ids.add(row.blockerId)
      if (row.blockedId !== userId) ids.add(row.blockedId)
    }
    return ids
  }
}
