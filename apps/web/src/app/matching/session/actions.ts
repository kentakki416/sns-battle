"use server"

import type {
  EndMatchingSessionResponse,
  IssueMatchingTokenResponse,
  JoinMatchingResponse,
  StartMatchingSessionResponse,
  SubmitReactionResponse,
} from "@repo/api-schema"

import { apiClient } from "@/libs/api-client"

/**
 * `/matching/session` で使う mutation 系の Server Actions。
 * Browser からの直接 fetch は禁止のため、Client Component から呼び出される全ての
 * POST/DELETE はここを経由して Express API に流す。
 */

export type JoinMatchingActionResult =
  | { error: string; ok: false }
  | { data: JoinMatchingResponse; ok: true }

export const joinMatchingAction = async (): Promise<JoinMatchingActionResult> => {
  try {
    const data = await apiClient.post<JoinMatchingResponse>("/api/matching/join", {})
    return { data, ok: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "join failed",
      ok: false,
    }
  }
}

export const leaveMatchingAction = async (): Promise<{ ok: boolean }> => {
  try {
    await apiClient.delete("/api/matching/leave")
    return { ok: true }
  } catch {
    /** 既に leave 済 / 未参加でも UI 側はリダイレクトしたいので失敗扱いにしない */
    return { ok: false }
  }
}

export type StartSessionActionResult =
  | { error: string; ok: false }
  | { data: StartMatchingSessionResponse; ok: true }

export const startMatchingSessionAction = async (
  sessionId: number,
): Promise<StartSessionActionResult> => {
  try {
    const data = await apiClient.post<StartMatchingSessionResponse>(
      `/api/matching/sessions/${sessionId}/start`,
      {},
    )
    return { data, ok: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "start failed",
      ok: false,
    }
  }
}

export type IssueTokenActionResult =
  | { error: string; ok: false }
  | { data: IssueMatchingTokenResponse; ok: true }

export const issueMatchingTokenAction = async (
  sessionId: number,
): Promise<IssueTokenActionResult> => {
  try {
    const data = await apiClient.post<IssueMatchingTokenResponse>("/api/matching/token", {
      session_id: sessionId,
    })
    return { data, ok: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "token failed",
      ok: false,
    }
  }
}

export type SubmitReactionActionInput = {
    choiceId: number | null
    roundNumber: number
    sessionId: number
    themeId: number
}

export type SubmitReactionActionResult =
    | { error: string; ok: false }
    | { data: SubmitReactionResponse; ok: true }

export const submitReactionAction = async (
  input: SubmitReactionActionInput,
): Promise<SubmitReactionActionResult> => {
  try {
    const data = await apiClient.post<SubmitReactionResponse>(
      `/api/matching/sessions/${input.sessionId}/reaction`,
      {
        choice_id: input.choiceId,
        round_number: input.roundNumber,
        theme_id: input.themeId,
      },
    )
    return { data, ok: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "reaction failed",
      ok: false,
    }
  }
}

export type EndSessionActionResult =
    | { error: string; ok: false }
    | { data: EndMatchingSessionResponse; ok: true }

export const endMatchingSessionAction = async (
  sessionId: number,
): Promise<EndSessionActionResult> => {
  try {
    const data = await apiClient.post<EndMatchingSessionResponse>(
      `/api/matching/sessions/${sessionId}/end`,
      {},
    )
    return { data, ok: true }
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "end failed",
      ok: false,
    }
  }
}
