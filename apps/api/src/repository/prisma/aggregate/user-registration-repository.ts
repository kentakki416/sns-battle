import { PrismaClient, Prisma as PrismaTypes } from "../../../prisma/generated/client"
import { User } from "../../../types/domain"

/**
 * ユーザー登録時の入力
 */
export type CreateUserRegistrationInput = {
    authAccount: {
        provider: string
        providerAccountId: string
    }
    user: {
        avatarUrl?: string
        email?: string
        name?: string
    }
}

/**
 * ユーザー登録リポジトリのインターフェース
 */
export interface UserRegistrationRepository {
    createUserWithAuthAccountTx(data: CreateUserRegistrationInput): Promise<User>
}

/**
 * Prisma実装のユーザー登録リポジトリ
 */
export class PrismaUserRegistrationRepository implements UserRegistrationRepository {
  constructor(private prisma: PrismaClient) {}

  /**
   * ユーザーの新規作成時のDB処理（トランザクション）
   * User と AuthAccount を同時に作成する集約処理
   */
  async createUserWithAuthAccountTx(
    data: CreateUserRegistrationInput
  ): Promise<User> {
    const prismaUser = await this.prisma.$transaction(async (tx) => {
      // User 作成
      const user = await tx.user.create({
        data: {
          avatarUrl: data.user.avatarUrl,
          email: data.user.email,
          name: data.user.name,
        },
      })

      // AuthAccount 作成
      await tx.authAccount.create({
        data: {
          provider: data.authAccount.provider,
          providerAccountId: data.authAccount.providerAccountId,
          userId: user.id,
        },
      })

      return user
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
