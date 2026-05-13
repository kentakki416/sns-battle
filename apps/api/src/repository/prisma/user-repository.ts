import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { Hobby, User } from "../../types/domain"

import { TransactionContext } from "./transaction-runner"

/**
 * ユーザー作成時の入力
 */
export type CreateUserInput = {
    avatarUrl?: string
    email?: string
    name?: string
}

/**
 * 趣味込みのユーザープロフィール
 */
export type UserProfileWithHobbies = {
    hobbies: Hobby[]
    user: User
}

/**
 * プロフィール更新時の入力。
 * undefined のフィールドは現状維持、null は明示的なクリア。
 * hobbyIds は配列を渡すと全削除→再作成で完全置換、undefined なら現状維持。
 */
export type UpdateUserInput = {
    avatarUrl?: string | null
    bio?: string | null
    birthDate?: Date
    gender?: "MALE" | "FEMALE" | "OTHER"
    hobbyIds?: number[]
    location?: string | null
    mbti?: string | null
    name?: string
}

/**
 * オンボーディング完了時の入力。
 * 必須: name / birthDate / gender / hobbyIds（空配列許容）/ bio / mbti / location（null 許容）。
 * Service 層で未指定を null / [] に正規化してから渡すこと。
 */
export type CompleteOnboardingInput = {
    bio: string | null
    birthDate: Date
    gender: "MALE" | "FEMALE" | "OTHER"
    hobbyIds: number[]
    location: string | null
    mbti: string | null
    name: string
}

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
    completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<void>
    create(data: CreateUserInput, tx?: TransactionContext): Promise<User>
    findByEmail(email: string): Promise<User | null>
    findById(id: number): Promise<User | null>
    /**
     * 指定 id 群のユーザーを一括取得する。マッチング多段照合の N+1 回避用。
     * 戻り値の順序は ids の順序と一致しないので、呼び出し側で Map 化して使う。
     */
    findManyByIds(ids: number[]): Promise<User[]>
    findProfileById(id: number): Promise<UserProfileWithHobbies | null>
    update(id: number, data: UpdateUserInput): Promise<void>
}

/**
 * ユーザー検索結果の軽量プロフィール。
 */
export type UserSearchResult = {
    avatarUrl: string | null
    bio: string | null
    id: number
    name: string | null
}

/**
 * ユーザー検索 Repository。
 *
 * 既存の `UserRepository` 利用箇所（auth / matching / profile 等）に影響を与えないよう、検索系メソッドだけを
 * 別 interface に分離している。`PrismaUserRepository` は両方を実装する。
 *
 * 検索条件:
 * - name 列の部分一致（case-insensitive, ILIKE）
 * - `excludeIds` 指定でブロック関係などのスキップに使う
 * - cursor は user.id 降順を前提とし、`cursor` 未指定で最新、指定で `id < cursor` を返す
 */
export interface UserSearchRepository {
    searchByName(opts: {
        cursor: number | undefined
        excludeIds: number[]
        limit: number
        query: string
    }): Promise<UserSearchResult[]>
}

/**
 * おすすめユーザー結果（フォロワー数込み）。
 */
export type RecommendedUser = {
    avatarUrl: string | null
    bio: string | null
    followerCount: number
    id: number
    name: string | null
}

/**
 * おすすめユーザー取得 Repository。
 *
 * 並び順は「フォロワー数 降順 → user.id 昇順」。`excludeIds` には呼び出し側で
 * 「自分自身 + 既フォロー + 双方向ブロック」をまとめて渡す。
 * `isOnboarded = true` のユーザーのみを対象とする。
 */
export interface UserRecommendationRepository {
    findRecommendations(opts: {
        excludeIds: number[]
        limit: number
    }): Promise<RecommendedUser[]>
}

/**
 * Prisma実装のユーザーリポジトリ
 */
export class PrismaUserRepository
implements UserRepository, UserRecommendationRepository, UserSearchRepository {
  private _prisma: PrismaClient

  constructor(prisma: PrismaClient) {
    this._prisma = prisma
  }

  async findById(id: number): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { id } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  async findByEmail(email: string): Promise<User | null> {
    const prismaUser = await this._prisma.user.findUnique({ where: { email } })
    if (!prismaUser) return null
    return this._toDomainUser(prismaUser)
  }

  async findManyByIds(ids: number[]): Promise<User[]> {
    if (ids.length === 0) return []
    const rows = await this._prisma.user.findMany({ where: { id: { in: ids } } })
    return rows.map((row) => this._toDomainUser(row))
  }

  async findProfileById(id: number): Promise<UserProfileWithHobbies | null> {
    const prismaUser = await this._prisma.user.findUnique({
      include: {
        hobbies: {
          include: { hobby: true },
          orderBy: { hobby: { sortOrder: "asc" } },
        },
      },
      where: { id },
    })
    if (!prismaUser) return null
    return {
      hobbies: prismaUser.hobbies.map((uh) => ({
        id: uh.hobby.id,
        name: uh.hobby.name,
        sortOrder: uh.hobby.sortOrder,
      })),
      user: this._toDomainUser(prismaUser),
    }
  }

  async create(data: CreateUserInput, tx?: TransactionContext): Promise<User> {
    const client = tx ?? this._prisma
    const prismaUser = await client.user.create({
      data: {
        avatarUrl: data.avatarUrl,
        email: data.email,
        name: data.name,
      },
    })
    return this._toDomainUser(prismaUser)
  }

  async completeOnboarding(id: number, data: CompleteOnboardingInput): Promise<void> {
    await this._prisma.$transaction(async (tx) => {
      await tx.user.update({
        data: {
          bio: data.bio,
          birthDate: data.birthDate,
          gender: data.gender,
          isOnboarded: true,
          location: data.location,
          mbti: data.mbti,
          name: data.name,
        },
        where: { id },
      })
      /**
       * 趣味は新規ユーザー想定だが、念のため一旦削除して入れ直し
       */
      await tx.userHobby.deleteMany({ where: { userId: id } })
      if (data.hobbyIds.length > 0) {
        await tx.userHobby.createMany({
          data: data.hobbyIds.map((hobbyId) => ({ hobbyId, userId: id })),
        })
      }
    })
  }

  async update(id: number, data: UpdateUserInput): Promise<void> {
    await this._prisma.$transaction(async (tx) => {
      /**
       * users 本体の更新（指定されたフィールドのみ）
       */
      const userUpdateData: PrismaTypes.UserUpdateInput = {
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
        ...(data.bio !== undefined ? { bio: data.bio } : {}),
        ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
        ...(data.gender !== undefined ? { gender: data.gender } : {}),
        ...(data.location !== undefined ? { location: data.location } : {}),
        ...(data.mbti !== undefined ? { mbti: data.mbti } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
      }
      if (Object.keys(userUpdateData).length > 0) {
        await tx.user.update({ data: userUpdateData, where: { id } })
      }

      /**
       * 趣味は配列指定があれば全削除→再作成で完全置換
       */
      if (data.hobbyIds !== undefined) {
        await tx.userHobby.deleteMany({ where: { userId: id } })
        if (data.hobbyIds.length > 0) {
          await tx.userHobby.createMany({
            data: data.hobbyIds.map((hobbyId) => ({ hobbyId, userId: id })),
          })
        }
      }
    })
  }

  async findRecommendations(opts: {
    excludeIds: number[]
    limit: number
  }): Promise<RecommendedUser[]> {
    /**
     * フォロワー数降順 + 同数の場合は user.id 昇順で安定ソート。
     * Prisma の `orderBy: { <relation>: { _count: ... } }` をフォロワーリレーション（`followers`）に適用する。
     */
    const conditions: PrismaTypes.UserWhereInput[] = [{ isOnboarded: true }]
    if (opts.excludeIds.length > 0) {
      conditions.push({ id: { notIn: opts.excludeIds } })
    }
    const rows = await this._prisma.user.findMany({
      orderBy: [{ followers: { _count: "desc" } }, { id: "asc" }],
      select: {
        _count: { select: { followers: true } },
        avatarUrl: true,
        bio: true,
        id: true,
        name: true,
      },
      take: opts.limit,
      where: { AND: conditions },
    })
    return rows.map((row) => ({
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      followerCount: row._count.followers,
      id: row.id,
      name: row.name,
    }))
  }

  async searchByName(opts: {
    cursor: number | undefined
    excludeIds: number[]
    limit: number
    query: string
  }): Promise<UserSearchResult[]> {
    /**
     * Postgres の citext ではなく、Prisma の `mode: "insensitive"` で大文字小文字を無視した ILIKE 相当を使う。
     * `contains` は内部的に `%query%` に展開される。
     */
    const conditions: PrismaTypes.UserWhereInput[] = [
      { name: { contains: opts.query, mode: "insensitive" } },
    ]
    if (opts.excludeIds.length > 0) {
      conditions.push({ id: { notIn: opts.excludeIds } })
    }
    if (opts.cursor !== undefined) {
      conditions.push({ id: { lt: opts.cursor } })
    }
    const rows = await this._prisma.user.findMany({
      orderBy: { id: "desc" },
      select: {
        avatarUrl: true,
        bio: true,
        id: true,
        name: true,
      },
      take: opts.limit,
      where: { AND: conditions },
    })
    return rows.map((row) => ({
      avatarUrl: row.avatarUrl,
      bio: row.bio,
      id: row.id,
      name: row.name,
    }))
  }

  /**
     * Prismaの型 → ドメインの型に変換
     */
  private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
    return {
      avatarUrl: prismaUser.avatarUrl,
      bio: prismaUser.bio,
      birthDate: prismaUser.birthDate,
      coinBalance: prismaUser.coinBalance,
      createdAt: prismaUser.createdAt,
      email: prismaUser.email,
      gender: prismaUser.gender,
      id: prismaUser.id,
      isOnboarded: prismaUser.isOnboarded,
      location: prismaUser.location,
      mbti: prismaUser.mbti,
      name: prismaUser.name,
      updatedAt: prismaUser.updatedAt,
    }
  }
}
