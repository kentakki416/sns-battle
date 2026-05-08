"use client"

const MBTI_TYPES = [
  "INTJ", "INTP", "ENTJ", "ENTP",
  "INFJ", "INFP", "ENFJ", "ENFP",
  "ISTJ", "ISFJ", "ESTJ", "ESFJ",
  "ISTP", "ISFP", "ESTP", "ESFP",
] as const

type Props = {
  defaultValue?: string
}

/**
 * MBTI 16 タイプの単一選択。空文字で「選択しない」（API 側では null として扱う）。
 * step9 で apps/web/src/components/forms に共通化予定。
 */
export function MbtiSelect({ defaultValue }: Props) {
  return (
    <select
      className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
      defaultValue={defaultValue ?? ""}
      name="mbti"
    >
      <option value="">選択しない</option>
      {MBTI_TYPES.map((t) => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
}
