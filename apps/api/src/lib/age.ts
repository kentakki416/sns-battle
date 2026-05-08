/**
 * 生年月日から満年齢を計算する。
 * birthDate が null なら null を返す。
 * 誕生日前なら 1 を引く（例: 1995-05-15 生まれを 2026-05-08 時点で計算 → 30 歳）。
 */
export const calculateAge = (birthDate: Date | null, today: Date = new Date()): number | null => {
  if (!birthDate) return null
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1
  }
  return age
}

/**
 * 生年月日が成人（18 歳以上 120 歳以下）かを判定する。
 * birthDate から年齢を算出し範囲内であれば true を返す。
 */
export const isValidAdultAge = (birthDate: Date, today: Date = new Date()): boolean => {
  const age = calculateAge(birthDate, today)
  if (age === null) return false
  return age >= 18 && age <= 120
}
