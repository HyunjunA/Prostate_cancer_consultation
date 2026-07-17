// Dedicated proxy for the admin upload history (GET /api/admin/upload-log).
//
// The generic backend proxy injects the X-API-Key but not the admin session, and
// this endpoint is gated by the backend's require_admin_user. So, exactly like the
// upload-transcript route, forward the httpOnly admin_session cookie as a Bearer
// token alongside the API key.
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_KEY = process.env.API_KEY || "";

export async function GET(request: NextRequest) {
  const limit = request.nextUrl.searchParams.get("limit") || "50";
  const targetUrl = `${BACKEND_URL}/api/admin/upload-log?limit=${encodeURIComponent(limit)}`;

  const headers: HeadersInit = {};
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  const adminToken = request.cookies.get("admin_session")?.value;
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }

  try {
    const backendResponse = await fetch(targetUrl, { method: "GET", headers });
    const responseBody = await backendResponse.arrayBuffer();
    return new NextResponse(responseBody, {
      status: backendResponse.status,
      headers: {
        "Content-Type":
          backendResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backend unreachable" }, { status: 502 });
  }
}
