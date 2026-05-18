"use client"

import { DotLottieReact } from "@lottiefiles/dotlottie-react"
import Link from "next/link"

export function NavbarLogo() {
  return (
    <Link className="flex items-center gap-2.5" href="/">
      <span className="flex h-8 w-8 items-center justify-center">
        <DotLottieReact
          autoplay
          loop
          src="/kenttaki-bot.lottie"
          style={{ height: "100%", width: "100%" }}
        />
      </span>
      <span className="text-base font-semibold tracking-tight text-white">
        SNS Battle
      </span>
    </Link>
  )
}
