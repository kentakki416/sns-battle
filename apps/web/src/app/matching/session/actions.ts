"use server"

import type {
  IssueMatchingTokenResponse,
  JoinMatchingResponse,
  StartMatchingSessionResponse,
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
