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
  const contentType = request.headers.get("content-type");
  if (contentType) {
    headers["Content-Type"] = contentType;
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
