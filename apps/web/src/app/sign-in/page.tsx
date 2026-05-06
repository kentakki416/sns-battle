import type { Metadata } from "next"

import { BrandPanel } from "./_components/BrandPanel"
import { SignInBackground } from "./_components/SignInBackground"
import { SignInCard } from "./_components/SignInCard"

export const metadata: Metadata = {
  title: "サインイン | SNS Battle",
}

type Props = {
  searchParams: Promise<{ error?: string }>
}

export default async function SignInPage({ searchParams }: Props) {
  const { error } = await searchParams

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-dark-base">
      <SignInBackground />

      <div className="relative z-10 flex w-full max-w-5xl items-center justify-between gap-16 px-8">
        <BrandPanel />
        <SignInCard error={error} />
      </div>
    </main>
  )
}
