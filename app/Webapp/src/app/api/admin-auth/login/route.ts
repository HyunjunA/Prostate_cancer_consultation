// Admin login route handler (server-side).
//
// Receives { username, password } from the login form, forwards to the
// backend's AUTH_MODE-independent admin login endpoint, and — on success —
// stores the returned JWT in an httpOnly `admin_session` cookie. The token is
// never exposed to client JS. Logout clears this cookie (see ../logout).
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const COOKIE_NAME = "admin_session";

export async function POST(request: NextRequest) {
  let body: { username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!username || !password) {
    return NextResponse.json(
      { error: "Username and password are required" },
      { status: 400 },
    );
  }

  let backendResponse: Response;
  try {
    backendResponse = await fetch(`${BACKEND_URL}/api/admin-auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }

  if (!backendResponse.ok) {
    // Surface the backend's 401/403 to the form without leaking internals.
    let detail = "Login failed";
    try {
      const data = await backendResponse.json();
      if (typeof data?.detail === "string") detail = data.detail;
    } catch {
      /* keep generic message */
    }
    return NextResponse.json({ error: detail }, { status: backendResponse.status });
  }

  const data = (await backendResponse.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!data.access_token) {
    return NextResponse.json({ error: "Malformed token response" }, { status: 502 });
  }

  // Secure flag follows the actual transport: on over plain http (local), off
  // so the cookie is still set; on over https (production), the cookie is
  // marked Secure. This is the "environment-aware" behaviour without keying on
  // NODE_ENV (the local Docker build also runs NODE_ENV=production over http).
  const isHttps =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: data.access_token,
    httpOnly: true,
    sameSite: "strict",
    secure: isHttps,
    path: "/",
    maxAge: typeof data.expires_in === "number" ? data.expires_in : 3600,
  });
  return response;
}
