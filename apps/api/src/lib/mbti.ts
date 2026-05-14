/**
 * MBTI 相性スコア（0..100）の算出。
 *
 * 各次元（E/I, N/S, T/F, J/P）ごとに「同じ文字」「異なる文字」の点数を割り当て、
 * 4 次元合計を返す。重み付けは MBTI 相性論の一般的な傾向に基づくシンプルなヒューリスティック:
 *
 * - E/I: complementary（異なる方が補完的）→ diff > same
 * - N/S: 同じ世界観（情報収集スタイル）が大切 → same > diff
 * - T/F: complementary（判断スタイルの補完）→ diff > same
 * - J/P: 同じライフスタイルが心地よい → same > diff
 *
 * 結果のレンジ:
 * - 最小: 同 E/I + 異 N/S + 同 T/F + 異 J/P = 15 + 12 + 18 + 12 = 57
 * - 最大: 異 E/I + 同 N/S + 異 T/F + 同 J/P = 25 + 25 + 25 + 25 = 100
 *
 * いずれか / 両方の MBTI が未設定（null）の場合は null を返す。
 * 形式不正な文字列が渡された場合も null を返す（呼び出し側で `users.mbti` の値域を信頼するが防御的に弾く）。
 */

const VALID_MBTI_REGEX = /^[EI][NS][TF][JP]$/

type DimensionWeight = {
  diff: number
  same: number
}

/**
 * 4 次元それぞれの「同 / 異」点数。合計が 100 になるように設計してある。
 */
const DIMENSION_WEIGHTS: ReadonlyArray<DimensionWeight> = [
  /** 0: E/I */
  { diff: 25, same: 15 },
  /** 1: N/S */
  { diff: 12, same: 25 },
  /** 2: T/F */
  { diff: 25, same: 18 },
  /** 3: J/P */
  { diff: 12, same: 25 },
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
