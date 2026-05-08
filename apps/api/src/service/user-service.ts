import { calculateAge, isValidAdultAge } from "../lib/age"
import { logger } from "../log"
import { HobbyRepository, UserRepository } from "../repository/prisma"
import { Hobby, User } from "../types/domain"
import {
  badRequestError,
  err,
  forbiddenError,
  notFoundError,
  ok,
  Result,
} from "../types/result"

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

/**
 * プロフィール更新時の入力。Repository の UpdateUserInput と同形だが、
 * Service 層は外部公開層（@repo/api-schema）と Repository の中間として独立した型を持つ。
 */
export type UpdateUserProfileInput = {
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
 * 自分のプロフィールを更新する。
 * - targetUserId !== viewerUserId は 403 FORBIDDEN
 * - 対象ユーザーが存在しない場合は 404 NOT_FOUND
 * - birthDate 指定時は 18 歳以上 120 歳以下のチェック
 * - hobbyIds 指定時は hobby_masters の有効 id のみ受け付ける
 * 更新後は findProfileById で fresh なプロフィール（趣味込み）を返す。
 */
export const updateUserProfile = async (
  input: { data: UpdateUserProfileInput; targetUserId: number; viewerUserId: number },
  repo: { hobbyRepository: HobbyRepository; userRepository: UserRepository }
): Promise<Result<UserProfile>> => {
  const { data, targetUserId, viewerUserId } = input
  logger.debug("UserService: Updating user profile", {
    targetUserId,
    viewerUserId,
  })

  if (targetUserId !== viewerUserId) {
    return err(forbiddenError("Cannot update other user's profile"))
  }

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  if (data.birthDate !== undefined && !isValidAdultAge(data.birthDate)) {
    return err(badRequestError("Age must be between 18 and 120"))
  }

  if (data.hobbyIds !== undefined && data.hobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.hobbyIds)
    if (found.length !== data.hobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  await repo.userRepository.update(targetUserId, {
    ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
    ...(data.bio !== undefined ? { bio: data.bio } : {}),
    ...(data.birthDate !== undefined ? { birthDate: data.birthDate } : {}),
    ...(data.gender !== undefined ? { gender: data.gender } : {}),
    ...(data.hobbyIds !== undefined ? { hobbyIds: data.hobbyIds } : {}),
    ...(data.location !== undefined ? { location: data.location } : {}),
    ...(data.mbti !== undefined ? { mbti: data.mbti } : {}),
    ...(data.name !== undefined ? { name: data.name } : {}),
  })

  const fresh = await repo.userRepository.findProfileById(targetUserId)
  if (!fresh) {
    return err(notFoundError("User not found"))
  }

  const profile: UserProfile = {
    age: calculateAge(fresh.user.birthDate),
    avatarUrl: fresh.user.avatarUrl,
    bio: fresh.user.bio,
    birthDate: fresh.user.birthDate,
    coinBalance: fresh.user.coinBalance,
    createdAt: fresh.user.createdAt,
    gender: fresh.user.gender,
    hobbies: fresh.hobbies,
    id: fresh.user.id,
    isOnboarded: fresh.user.isOnboarded,
    isSelf: true,
    location: fresh.user.location,
    mbti: fresh.user.mbti,
    name: fresh.user.name,
  }
  return ok(profile)
}
