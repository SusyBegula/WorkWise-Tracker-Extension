import { NextResponse } from "next/server"
import { getSession } from "@/lib/auth"
import { querySQLite } from "@/lib/db"

export async function GET(request: Request) {
  try {
    const session = await getSession()
    if (!session || session.role !== "admin") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const email = searchParams.get("email")

    let query = "SELECT id, email, url, title, timestamp, filepath FROM screenshots ORDER BY timestamp DESC LIMIT 100"
    const params: any[] = []

    if (email) {
      query = "SELECT id, email, url, title, timestamp, filepath FROM screenshots WHERE email = ? ORDER BY timestamp DESC LIMIT 100"
      params.push(email.toLowerCase().trim())
    }

    const screenshots = await querySQLite<{
      id: number
      email: string
      url: string
      title: string
      timestamp: string
      filepath: string
    }>(query, params)

    // Map database record to include a web URL pointing to our image serving endpoint
    const data = screenshots.map(s => ({
      id: s.id,
      email: s.email,
      url: s.url,
      title: s.title,
      timestamp: s.timestamp,
      imageUrl: `/api/telemetry/screenshots/image?id=${s.id}` // Serves raw JPEG from disk
    }))

    return NextResponse.json(data)
  } catch (err: any) {
    console.error("Screenshots API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
