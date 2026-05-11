import { Response } from "express"

import {
  type ErrorResponse,
  unblockUserPathParamSchema,
  unblockUserResponseSchema,
} from "@repo/api-schema"

import { logger } from "../../log"
import { AuthRequest } from "../../middleware/auth"
import { BlockMutationRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * DELETE /api/users/:id/block
 * 認証ユーザーが path param のユーザーへのブロックを解除する。元々ブロックしていなくても 200。
 */
export class BlockDeleteController {
  constructor(private blockMutationRepository: BlockMutationRepository) {}

  async execute(req: AuthRequest, res: Response) {
    const { id } = unblockUserPathParamSchema.parse(req.params)
    logger.info("BlockDeleteController: unblock", { blockedId: id, blockerId: req.userId })

    const result = await service.block.unblockUser(
      { blockedId: id, blockerId: req.userId! },
      { blockMutationRepository: this.blockMutationRepository },
    )

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    return res.status(200).json(unblockUserResponseSchema.parse({ message: "OK" }))
  }
}
