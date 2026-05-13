import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { Suspense } from "react"

import { getCurrentUser } from "@/libs/current-user"

import { SearchClient } from "./_components/SearchClient"

export const metadata: Metadata = {
  title: "検索 | SNS Battle",
}

export default async function SearchPage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")

  return (
    <main className="relative mx-auto max-w-3xl space-y-6 p-6">
      {/**
       * 背景装飾（パープル + シアン blur オーブ）
       */}
      <div
        aria-hidden
        className="pointer-events-none fixed -left-1/4 top-20 -z-10 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed -right-1/4 bottom-0 -z-10 h-[400px] w-[400px] rounded-full bg-cyan/[0.03] blur-[120px]"
      />
      {/**
       * SearchClient は内部で useSearchParams を使うため、必ず Suspense 配下に置く（Next.js 16）。
       * fallback はネットワークが速ければ目視されない短い表示。
       */}
      <Suspense
        fallback={<p className="py-12 text-center text-sm text-text-muted">読み込み中...</p>}
      >
        <SearchClient />
      </Suspense>
    </main>
  )
}
