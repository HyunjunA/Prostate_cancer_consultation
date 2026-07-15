// Dedicated upload proxy for the admin transcript upload.
//
// The generic backend proxy (app/api/backend/[...path]/route.ts) reads the body
// with `request.text()`, which corrupts binary payloads (xlsx). This route
// forwards the raw multipart body byte-for-byte to the backend's
// POST /api/admin/upload-transcript, injecting the server-only X-API-Key and the
// admin session (httpOnly cookie -> Bearer) exactly like the generic proxy does.
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_KEY = process.env.API_KEY || "";

export async function POST(request: NextRequest) {
  const targetUrl = `${BACKEND_URL}/api/admin/upload-transcript`;

  const headers: HeadersInit = {};
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  // Admin auth: forward the httpOnly session cookie as a Bearer token so the
  // backend's require_admin_user dependency can authenticate the logged-in admin.
  const adminToken = request.cookies.get("admin_session")?.value;
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }
  // Preserve the multipart content-type INCLUDING its boundary, and forward the
  // raw bytes untouched (arrayBuffer, not text) so the file survives intact.
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  try {
    const body = await request.arrayBuffer();
    const backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body,
    });
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
