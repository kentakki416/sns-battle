import { Response } from "express"

import {
  blockUserPathParamSchema,
  blockUserResponseSchema,
  type ErrorResponse,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import {
  BlockMutationRepository,
  FollowBidirectionalRepository,
  TransactionRunner,
  UserRepository,
} from "../../repository/prisma"
import * as service from "../../service"

/**
 * POST /api/users/:id/block
 * 認証ユーザーが path param のユーザーをブロックする。
 * 副作用として双方向のフォロー関係を削除する。
 */
export class BlockCreateController {
  constructor(
    private blockMutationRepository: BlockMutationRepository,
    private followBidirectionalRepository: FollowBidirectionalRepository,
    private transactionRunner: TransactionRunner,
    private userRepository: UserRepository,
  ) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = blockUserPathParamSchema.parse(req.params)
    logger.info("BlockCreateController: block", { blockedId: id, blockerId: req.userId })

    const result = await service.block.blockUser(
      { blockedId: id, blockerId: req.userId! },
      {
        blockMutationRepository: this.blockMutationRepository,
        followBidirectionalRepository: this.followBidirectionalRepository,
        transactionRunner: this.transactionRunner,
        userRepository: this.userRepository,
      },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(
      blockUserResponseSchema.parse({
        blocked_id: result.value.blockedId,
        blocker_id: result.value.blockerId,
      }),
    )
  }
}
