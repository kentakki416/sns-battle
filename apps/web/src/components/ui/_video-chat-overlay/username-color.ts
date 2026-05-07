/**
 * ユーザー名から HSL カラー文字列を生成する。
 * 同じ名前は常に同じ色になる。彩度・輝度は固定し、視認性のため明るめに調整。
 */
export const getUsernameColor = (username: string): string => {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash)
    hash |= 0
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 75%)`
}
