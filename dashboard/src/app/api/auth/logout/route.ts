import { NextResponse } from "next/server"

export async function POST() {
  const response = NextResponse.json({ success: true })
  
  // Clear the workwise_session cookie
  response.cookies.set("workwise_session", "", {
    httpOnly: true,
    path: "/",
    maxAge: 0 // Expire instantly
  })

  return response
}
