import { calculateAge } from "../lib/age"
import { logger } from "../log"
import { UserRepository } from "../repository/prisma"
import { Hobby, User } from "../types/domain"
import { err, notFoundError, ok, Result } from "../types/result"

/**
 * 公開範囲考慮済みのユーザープロフィール
 * birthDate / coinBalance は閲覧者が本人 (isSelf=true) のときのみ値あり、他人取得時は null マスク。
 */
export type UserProfile = {
  age: number | null
  avatarUrl: string | null
  bio: string | null
  birthDate: Date | null
  coinBalance: number | null
  createdAt: Date
  gender: User["gender"]
  hobbies: Hobby[]
  id: number
  isOnboarded: boolean
  isSelf: boolean
  location: string | null
  mbti: string | null
  name: string | null
}

/**
 * ユーザーIDからユーザー情報を取得
 */
export const getUserById = async (
  userId: number,
  repo: { userRepository: UserRepository }
): Promise<Result<User>> => {
  logger.debug("UserService: Fetching user by ID", {
    userId,
  })
  const user = await repo.userRepository.findById(userId)
  if (!user) {
    logger.debug("UserService: User not found", {
      userId,
    })
    return err(notFoundError("User not found"))
  }
  logger.debug("UserService: User found", {
    userId: user.id,
  })
  return ok(user)
}

/**
 * 趣味込みのユーザープロフィールを取得し、閲覧者の視点で公開範囲を整える。
 * targetUserId === viewerUserId のときは isSelf=true とし、birthDate / coinBalance も値を返す。
 * 他人取得時は birthDate / coinBalance を null マスク（mbti / location / hobbies は公開）。
 */
export const getUserProfile = async (
  input: { targetUserId: number; viewerUserId: number },
  repo: { userRepository: UserRepository }
): Promise<Result<UserProfile>> => {
  const { targetUserId, viewerUserId } = input
  logger.debug("UserService: Fetching user profile", {
    targetUserId,
    viewerUserId,
  })

  const found = await repo.userRepository.findProfileById(targetUserId)
  if (!found) {
    logger.debug("UserService: User profile not found", {
      targetUserId,
    })
    return err(notFoundError("User not found"))
  }

  const { hobbies, user } = found
  const isSelf = user.id === viewerUserId

  const profile: UserProfile = {
    age: calculateAge(user.birthDate),
    avatarUrl: user.avatarUrl,
    bio: user.bio,
    birthDate: isSelf ? user.birthDate : null,
    coinBalance: isSelf ? user.coinBalance : null,
    createdAt: user.createdAt,
    gender: user.gender,
    hobbies,
    id: user.id,
    isOnboarded: user.isOnboarded,
    isSelf,
    location: user.location,
    mbti: user.mbti,
    name: user.name,
  }
  return ok(profile)
}
