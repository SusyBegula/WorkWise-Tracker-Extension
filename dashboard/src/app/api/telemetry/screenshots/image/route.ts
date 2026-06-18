import { getSession } from "@/lib/auth"
import { querySQLite } from "@/lib/db"
import fs from "fs"

export async function GET(request: Request) {
  try {
    // 1. Authenticate manager session
    const session = await getSession()
    if (!session || session.role !== "admin") {
      return new Response("Unauthorized", { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")

    if (!id) {
      return new Response("Bad Request: ID is required", { status: 400 })
    }

    // 2. Fetch the screenshot file path from SQLite
    const result = await querySQLite<{ filepath: string }>(
      "SELECT filepath FROM screenshots WHERE id = ?",
      [id]
    )

    if (result.length === 0) {
      return new Response("Screenshot record not found in database", { status: 404 })
    }

    const filepath = result[0].filepath

    // 3. Read raw file binary from storage
    if (!fs.existsSync(filepath)) {
      console.warn(`[Dashboard DB] Screenshot file missing on local disk: ${filepath}`)
      return new Response("File not found on disk", { status: 404 })
    }

    const buffer = fs.readFileSync(filepath)

    // Serve raw image with caching headers
    return new Response(buffer, {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=86400" // Cache for 24 hours locally
      }
    })
  } catch (err: any) {
    console.error("Screenshot serve API Error:", err)
    return new Response("Internal Server Error: " + err.message, { status: 500 })
  }
}
