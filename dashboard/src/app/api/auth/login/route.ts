import { NextResponse } from "next/server"
import { pgPool } from "@/lib/db"
import bcrypt from "bcryptjs"

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Local Test Admin interceptor for direct debugging
    if (normalizedEmail === "testadmin@workwise.com" || normalizedEmail === "admin@workwise.com") {
      if (password !== "admin123") {
        return NextResponse.json(
          { error: "Invalid password." },
          { status: 401 }
        )
      }

      const payload = {
        email: normalizedEmail,
        role: "admin",
        name: "Test Administrator",
        timestamp: Date.now()
      }
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64")
      const token = `mock-header.${base64Payload}.mock-signature`

      const response = NextResponse.json({
        success: true,
        user: {
          email: payload.email,
          name: payload.name,
          role: payload.role
        },
        token
      })

      response.cookies.set("workwise_session", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 // 1 day
      })

      return response
    }

    // Query Neon DB for credentials and role check
    const queryResult = await pgPool.query(
      "SELECT id, email, name, role, password_hash FROM users WHERE email = $1",
      [normalizedEmail]
    )

    if (queryResult.rows.length === 0) {
      return NextResponse.json(
        { error: "Access Denied: Your email is not registered in the system." },
        { status: 403 }
      )
    }

    const user = queryResult.rows[0]

    // Verify password hash
    const match = await bcrypt.compare(password, user.password_hash)
    if (!match) {
      return NextResponse.json(
        { error: "Invalid password." },
        { status: 401 }
      )
    }

    // Verify manager/admin authorization role
    if (user.role !== "admin") {
      return NextResponse.json(
        { error: "Forbidden: This dashboard is strictly for managers and administrators." },
        { status: 403 }
      )
    }

    // Set a lightweight mock session response containing token and user profile
    // Generate a simple base64 mock token for authentication header validation in API routes
    const payload = { email: normalizedEmail, role: user.role, name: user.name, timestamp: Date.now() }
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString("base64")
    const token = `mock-header.${base64Payload}.mock-signature`

    const response = NextResponse.json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        role: user.role
      },
      token
    })

    // Set HTTPOnly cookie to persist login session
    response.cookies.set("workwise_session", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 // 1 day
    })

    return response
  } catch (err: any) {
    console.error("Login API Error:", err)
    return NextResponse.json(
      { error: "Internal server error: " + err.message },
      { status: 500 }
    )
  }
}
