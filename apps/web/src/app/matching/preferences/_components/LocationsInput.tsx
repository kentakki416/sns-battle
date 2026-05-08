"use client"

import { useState, type KeyboardEvent } from "react"

type Props = {
  defaultValues?: string[]
}

/**
 * 居住地域をタグ追加方式で複数指定する。
 * - Enter で確定、x で削除
 * - 重複と空文字は無視
 * - 上限 20 件（API の Zod max 20 と一致）
 * - 各タグは hidden input で `preferred_locations` として送信
 */
export function LocationsInput({ defaultValues = [] }: Props) {
  const [tags, setTags] = useState<string[]>(defaultValues)
  const [draft, setDraft] = useState("")

  const addTag = () => {
    const t = draft.trim()
    if (t.length === 0 || tags.includes(t) || tags.length >= 20) return
    setTags([...tags, t])
    setDraft("")
  }

  const removeTag = (tag: string) => setTags(tags.filter((x) => x !== tag))

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-primary-border bg-primary-glow px-3 py-1 text-xs text-primary"
            key={tag}
          >
            {tag}
            <button
              aria-label={`${tag} を削除`}
              className="text-primary hover:text-white"
              onClick={() => removeTag(tag)}
              type="button"
            >
              ×
            </button>
            <input name="preferred_locations" type="hidden" value={tag} />
          </span>
        ))}
      </div>
      <input
        className="h-10 rounded-lg border border-dark-border bg-dark-base px-3 text-sm text-white focus:border-primary-border focus:outline-none"
        maxLength={100}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="例: 東京都（Enter で追加）"
        type="text"
        value={draft}
      />
    </div>
  )
}
