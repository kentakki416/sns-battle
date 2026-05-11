import { Router } from "express"

import { BlockCreateController } from "../controller/block/create"
import { BlockDeleteController } from "../controller/block/delete"
import { FollowCreateController } from "../controller/follow/create"
import { FollowDeleteController } from "../controller/follow/delete"
import { FollowersListController } from "../controller/follow/followers"
import { FollowingListController } from "../controller/follow/following"
import { UserGetController } from "../controller/user/get"
import { UserOnboardingController } from "../controller/user/onboarding"
import { UserUpdateController } from "../controller/user/update"

type UserRouterControllers = {
  blockCreate?: BlockCreateController
  blockDelete?: BlockDeleteController
  followCreate?: FollowCreateController
  followDelete?: FollowDeleteController
  followersList?: FollowersListController
  followingList?: FollowingListController
  get?: UserGetController
  onboarding?: UserOnboardingController
  update?: UserUpdateController
}

/**
 * ユーザー関連のルーター
 * 渡されたコントローラーのルートのみ登録する。
 * 長いパス（/:id/onboarding, /:id/follow, /:id/block, /:id/followers, /:id/following）を
 * /:id より先に登録して Express のマッチを安定させる。
 */
export const userRouter = (controllers: UserRouterControllers): Router => {
  const router = Router()

  // PUT /api/users/:id/onboarding
  if (controllers.onboarding) {
    const controller = controllers.onboarding
    router.put("/:id/onboarding", async (req, res) => controller.execute(req, res))
  }

  // POST /api/users/:id/follow
  if (controllers.followCreate) {
    const controller = controllers.followCreate
    router.post("/:id/follow", async (req, res) => controller.execute(req, res))
  }

  // DELETE /api/users/:id/follow
  if (controllers.followDelete) {
    const controller = controllers.followDelete
    router.delete("/:id/follow", async (req, res) => controller.execute(req, res))
  }

  // POST /api/users/:id/block
  if (controllers.blockCreate) {
    const controller = controllers.blockCreate
    router.post("/:id/block", async (req, res) => controller.execute(req, res))
  }

  // DELETE /api/users/:id/block
  if (controllers.blockDelete) {
    const controller = controllers.blockDelete
    router.delete("/:id/block", async (req, res) => controller.execute(req, res))
  }

  // GET /api/users/:id/followers
  if (controllers.followersList) {
    const controller = controllers.followersList
    router.get("/:id/followers", async (req, res) => controller.execute(req, res))
  }

  // GET /api/users/:id/following
  if (controllers.followingList) {
    const controller = controllers.followingList
    router.get("/:id/following", async (req, res) => controller.execute(req, res))
  }

  // GET /api/users/:id
  if (controllers.get) {
    const controller = controllers.get
    router.get("/:id", async (req, res) => controller.execute(req, res))
  }

  // PUT /api/users/:id
  if (controllers.update) {
    const controller = controllers.update
    router.put("/:id", async (req, res) => controller.execute(req, res))
  }

  return router
}
