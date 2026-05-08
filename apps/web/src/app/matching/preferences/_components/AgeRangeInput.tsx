"use client"

type Props = {
  defaultMax: number | null
  defaultMin: number | null
}

/**
 * 希望年齢範囲（min-max）を数値入力する。空欄 = 制限なし（API では null）。
 * 範囲は 18-120 をブラウザ側でブロックし、すり抜けても API で 400。
 */
export function AgeRangeInput({ defaultMax, defaultMin }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        className="h-10 w-20 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        defaultValue={defaultMin ?? ""}
        max={120}
        min={18}
        name="age_min"
        placeholder="18"
        type="number"
      />
      <span className="text-text-muted">〜</span>
      <input
        className="h-10 w-20 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        defaultValue={defaultMax ?? ""}
        max={120}
        min={18}
        name="age_max"
        placeholder="120"
        type="number"
      />
      <span className="text-xs text-text-muted">歳</span>
    </div>
  )
}
