import { redirect } from "next/navigation"

import { getCurrentUser } from "@/libs/current-user"

/**
 * /profile/me は自分の id を解決して /profile/{id} へリダイレクトする。
 * Sidebar / Navbar からの遷移先として使う。
 */
export default async function ProfileMePage() {
  const me = await getCurrentUser()
  if (!me) redirect("/sign-in")
  if (!me.is_onboarded) redirect("/onboarding")
  redirect(`/profile/${me.id}`)
}
