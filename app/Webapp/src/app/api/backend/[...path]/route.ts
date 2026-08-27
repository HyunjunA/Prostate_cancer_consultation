// URL convention: this proxy auto-prepends "/api/" to the captured path.
// So a request to "/api/backend/patient/files" forwards to
// "${BACKEND_URL}/api/patient/files". Callers (client components and ad-hoc
// curl alike) must NOT include a leading "api/" in the path segment after
// "/api/backend/" or the resulting URL becomes "/api/api/..." (404).
import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";
const API_KEY = process.env.API_KEY || "";

async function proxyRequest(
  request: NextRequest,
  { params }: { params: { path: string[] } }
) {
  const targetPath = params.path.join("/");
  const targetUrl = `${BACKEND_URL}/api/${targetPath}${request.nextUrl.search}`;

  const headers: HeadersInit = {};
  if (API_KEY) {
    headers["X-API-Key"] = API_KEY;
  }
  // Forward the admin session (httpOnly cookie) as a Bearer token so the
  // backend's admin-only endpoints (require_admin_user) can authenticate the
  // logged-in admin. Harmless for non-admin endpoints, which ignore it and
  // authenticate via X-API-Key. The cookie value never reaches client JS.
  const adminToken = request.cookies.get("admin_session")?.value;
  if (adminToken) {
    headers["Authorization"] = `Bearer ${adminToken}`;
  }
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
  }

  // Forward who the caller actually is.
  //
  // Every browser request reaches the backend through this proxy, so without
  // these headers the backend sees one address — this container — for every
  // user. 93% of access-log entries read 172.31.0.2, which makes the log
  // useless for answering "who did this?" and would make a PHI audit trail
  // record the same container on every row.
  //
  // X-Forwarded-For is append-only by convention: keep any upstream chain and
  // add the address we observed, so a future nginx in front still works.
  const forwardedFor = request.headers.get("x-forwarded-for");
  const observedIp = request.headers.get("x-real-ip") || request.ip || "";
  const chain = [forwardedFor, observedIp].filter(Boolean).join(", ");
  if (chain) {
    headers["X-Forwarded-For"] = chain;
  }
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) {
    headers["X-Forwarded-Proto"] = forwardedProto;
  }
  // The user agent distinguishes a real browser from a script when reviewing
  // access after the fact.
  const userAgent = request.headers.get("user-agent");
  if (userAgent) {
    headers["User-Agent"] = userAgent;
  }

  const fetchOptions: RequestInit = {
    method: request.method,
    headers,
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    fetchOptions.body = await request.text();
  }

  try {
    const backendResponse = await fetch(targetUrl, fetchOptions);
    const responseBody = await backendResponse.arrayBuffer();

    return new NextResponse(responseBody, {
      status: backendResponse.status,
      headers: {
        "Content-Type":
          backendResponse.headers.get("content-type") || "application/json",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Backend unreachable" },
      { status: 502 }
    );
  }
}

export const GET = proxyRequest;
export const POST = proxyRequest;
export const PUT = proxyRequest;
