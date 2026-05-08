import { Prisma as PrismaTypes, PrismaClient } from "../../prisma/generated/client"
import { Hobby, User } from "../../types/domain"

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
    create(data: CreateUserInput): Promise<User>
    findByEmail(email: string): Promise<User | null>
    findById(id: number): Promise<User | null>
    findProfileById(id: number): Promise<UserProfileWithHobbies | null>
    update(id: number, data: UpdateUserInput): Promise<void>
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
