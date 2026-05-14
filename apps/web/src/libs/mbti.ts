/**
 * MBTI 相性スコア（0..100）を算出する。
 *
 * **重要**: アルゴリズムと重みは `apps/api/src/lib/mbti.ts` と完全一致させること。
 * サーバー側の `GET /api/matching/sessions/:id` レスポンス（`mbti_compatibility`）と
 * クライアント側でローカル算出した値が食い違うと UX が壊れるため。
 *
 * - E/I: 異なる方が補完的 → diff(25) > same(15)
 * - N/S: 同じ世界観が重要 → same(25) > diff(12)
 * - T/F: 補完的な判断スタイル → diff(25) > same(18)
 * - J/P: 同じライフスタイル → same(25) > diff(12)
 *
 * 結果レンジ: 57（最も合いにくい組み合わせ）..100（最も合う組み合わせ）。
 * いずれかの MBTI が未設定 / 形式不正の場合は null を返す。
 */

const VALID_MBTI_REGEX = /^[EI][NS][TF][JP]$/

type DimensionWeight = {
  diff: number
  same: number
}

const DIMENSION_WEIGHTS: ReadonlyArray<DimensionWeight> = [
  /** E/I */ { diff: 25, same: 15 },
  /** N/S */ { diff: 12, same: 25 },
  /** T/F */ { diff: 25, same: 18 },
  /** J/P */ { diff: 12, same: 25 },
]

const isValidMbti = (value: string | null | undefined): value is string => {
  if (typeof value !== "string") return false
  return VALID_MBTI_REGEX.test(value)
}

export const calculateMbtiCompatibility = (
  a: string | null | undefined,
  b: string | null | undefined,
): number | null => {
  if (!isValidMbti(a) || !isValidMbti(b)) return null

  let score = 0
  for (let i = 0; i < 4; i += 1) {
    const weight = DIMENSION_WEIGHTS[i]
    score += a[i] === b[i] ? weight.same : weight.diff
  }
  return score
}
