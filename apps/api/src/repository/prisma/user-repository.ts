import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { User } from "../../types/domain"

/**
 * ユーザー作成時の入力
 */
export type CreateUserInput = {
    avatarUrl?: string
    email?: string
    name?: string
}

/**
 * ユーザーリポジトリのインターフェース
 */
export interface UserRepository {
    create(data: CreateUserInput): Promise<User>
    findByEmail(email: string): Promise<User | null>
    findById(id: number): Promise<User | null>
}

/**
 * Prisma実装のユーザーリポジトリ
 */
export class PrismaUserRepository implements UserRepository {
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

  async create(data: CreateUserInput): Promise<User> {
    const prismaUser = await this._prisma.user.create({
      data: {
        avatarUrl: data.avatarUrl,
        email: data.email,
        name: data.name,
      },
    })
    return this._toDomainUser(prismaUser)
  }

  /**
     * Prismaの型 → ドメインの型に変換
     */
  private _toDomainUser(prismaUser: PrismaTypes.UserGetPayload<{}>): User {
    return {
      avatarUrl: prismaUser.avatarUrl,
      createdAt: prismaUser.createdAt,
      email: prismaUser.email,
      id: prismaUser.id,
      name: prismaUser.name,
      updatedAt: prismaUser.updatedAt,
    }
  }
}
