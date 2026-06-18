import { getSession } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardContainer from "./components/DashboardContainer"

export default async function Page() {
  // Server-side authentication check
  const session = await getSession()

  // Redirect to login if session does not exist or user is not admin
  if (!session || session.role !== "admin") {
    redirect("/login")
  }

  return <DashboardContainer session={session} />
}
