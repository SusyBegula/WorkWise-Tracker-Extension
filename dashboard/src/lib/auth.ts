import { cookies } from "next/headers"

export interface SessionPayload {
  email: string
  role: string
  name: string
  timestamp: number
}

export async function getSession(): Promise<SessionPayload | null> {
  try {
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get("workwise_session")
    
    if (!sessionCookie || !sessionCookie.value) return null
    
    const parts = sessionCookie.value.split(".")
    if (parts.length === 3) {
      const payloadJson = Buffer.from(parts[1], "base64").toString("utf8")
      const payload = JSON.parse(payloadJson) as SessionPayload
      
      // Validate that session is under 24 hours old
      if (Date.now() - payload.timestamp > 24 * 60 * 60 * 1000) {
        return null
      }
      
      return payload
    }
  } catch (e) {
    return null
  }
  return null
}
