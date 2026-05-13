import { calculateAge, isValidAdultAge } from "../lib/age"
import { logger } from "../log"
import {
  BlockRepository,
  FollowListRepository,
  HobbyRepository,
  RecommendedUser,
  UserRecommendationRepository,
  UserRepository,
  UserSearchRepository,
  UserSearchResult,
} from "../repository/prisma"
import { Hobby, User } from "../types/domain"
import {
  badRequestError,
  conflictError,
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

/**
 * オンボーディング完了入力。
 * 必須: name / birthDate / gender。任意項目（mbti / location / bio）は null、hobbyIds は空配列を許容。
 */
export type CompleteOnboardingServiceInput = {
  bio: string | null
  birthDate: Date
  gender: "MALE" | "FEMALE" | "OTHER"
  hobbyIds: number[]
  location: string | null
  mbti: string | null
  name: string
}

/**
 * オンボーディングを完了する。
 * - targetUserId !== viewerUserId は 403 FORBIDDEN
 * - 対象ユーザー不在は 404 NOT_FOUND
 * - 既に is_onboarded=true は 409 CONFLICT
 * - 18 歳未満 / 120 歳超は 400 BAD_REQUEST
 * - hobby_ids が指定された場合は hobby_masters の有効 id のみ
 * 完了後は is_onboarded=true にし、findProfileById で fresh プロフィールを返す。
 */
export const completeOnboarding = async (
  input: { data: CompleteOnboardingServiceInput; targetUserId: number; viewerUserId: number },
  repo: { hobbyRepository: HobbyRepository; userRepository: UserRepository }
): Promise<Result<UserProfile>> => {
  const { data, targetUserId, viewerUserId } = input
  logger.debug("UserService: Completing onboarding", {
    targetUserId,
    viewerUserId,
  })

  if (targetUserId !== viewerUserId) {
    return err(forbiddenError("Cannot complete onboarding for other user"))
  }

  const user = await repo.userRepository.findById(targetUserId)
  if (!user) {
    return err(notFoundError("User not found"))
  }

  if (user.isOnboarded) {
    return err(conflictError("Onboarding already completed"))
  }

  if (!isValidAdultAge(data.birthDate)) {
    return err(badRequestError("Age must be between 18 and 120"))
  }

  if (data.hobbyIds.length > 0) {
    const found = await repo.hobbyRepository.findActiveByIds(data.hobbyIds)
    if (found.length !== data.hobbyIds.length) {
      return err(badRequestError("Invalid hobby_id"))
    }
  }

  await repo.userRepository.completeOnboarding(targetUserId, {
    bio: data.bio,
    birthDate: data.birthDate,
    gender: data.gender,
    hobbyIds: data.hobbyIds,
    location: data.location,
    mbti: data.mbti,
    name: data.name,
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

/**
 * ユーザー検索。name 列の case-insensitive 部分一致。
 * 双方向ブロック関係にあるユーザーは除外する（spec: ブロックは双方向に効果）。
 * 自分自身は除外しない（普通の検索 UX として、自分が見つかること自体は不自然ではない）。
 *
 * クエリ条件は schema で 1..100 文字に絞っているため、想定不正は schema 段の 400 で弾かれる。
 * 本サービスでは結果 0 件を「空 + nextCursor=null」で返すのみで、追加の業務エラーは無い。
 *
 * `nextCursor` 算出方針は getFollowers / getFollowing と同じ「limit ぴったり判定」。
 */
export const searchUsers = async (
  input: {
    cursor: number | undefined
    currentUserId: number
    limit: number
    query: string
  },
  repo: {
    blockRepository: BlockRepository
    userSearchRepository: UserSearchRepository
  },
): Promise<Result<{ entries: UserSearchResult[]; nextCursor: number | null }>> => {
  logger.debug("UserService: searchUsers", input)

  const blockedIds = await repo.blockRepository.findBlockedUserIds(input.currentUserId)
  const entries = await repo.userSearchRepository.searchByName({
    cursor: input.cursor,
    excludeIds: Array.from(blockedIds),
    limit: input.limit,
    query: input.query,
  })
  const nextCursor = entries.length === input.limit ? entries[entries.length - 1].id : null
  return ok({ entries, nextCursor })
}

/**
 * 認証ユーザーへのおすすめユーザー一覧。
 *
 * 除外条件（excludeIds に集約）:
 * - 自分自身
 * - 既にフォロー済みのユーザー（follower_id = currentUserId の followee 集合）
 * - 双方向ブロック関係にあるユーザー
 *
 * 並び順は Repository 側で「フォロワー数 降順 → user.id 昇順」固定。
 * 結果 0 件は空配列を返すのみで、業務エラーは無い。
 */
export const getRecommendedUsers = async (
  input: { currentUserId: number; limit: number },
  repo: {
    blockRepository: BlockRepository
    followListRepository: FollowListRepository
    userRecommendationRepository: UserRecommendationRepository
  },
): Promise<Result<{ entries: RecommendedUser[] }>> => {
  logger.debug("UserService: getRecommendedUsers", input)

  const [blockedIds, followingIds] = await Promise.all([
    repo.blockRepository.findBlockedUserIds(input.currentUserId),
    repo.followListRepository.findFollowingUserIds(input.currentUserId),
  ])

  const excludeIds = new Set<number>([input.currentUserId, ...blockedIds, ...followingIds])
  const entries = await repo.userRecommendationRepository.findRecommendations({
    excludeIds: Array.from(excludeIds),
    limit: input.limit,
  })
  return ok({ entries })
}
