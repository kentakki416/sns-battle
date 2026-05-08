import { Request, Response } from "express"

import { ErrorResponse, getHobbiesResponseSchema } from "@repo/api-schema"

import { logger } from "../../log"
import { HobbyRepository } from "../../repository/prisma"
import * as service from "../../service"

/**
 * GET /api/hobbies
 * 有効な趣味マスターを sort_order 昇順で返す。
 */
export class HobbyListController {
  constructor(private hobbyRepository: HobbyRepository) {}

  async execute(_req: Request, res: Response) {
    logger.info("HobbyListController: Fetching hobby list")

    const result = await service.hobby.getActiveHobbies({ hobbyRepository: this.hobbyRepository })

    if (!result.ok) {
      const errorResponse: ErrorResponse = {
        error: result.error.message,
        status_code: result.error.statusCode,
      }
      return res.status(result.error.statusCode).json(errorResponse)
    }

    const response = getHobbiesResponseSchema.parse({
      hobbies: result.value.map((h) => ({
        id: h.id,
        name: h.name,
        sort_order: h.sortOrder,
      })),
    })

    return res.status(200).json(response)
  }
}
