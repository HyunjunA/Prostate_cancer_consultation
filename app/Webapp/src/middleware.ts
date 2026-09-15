// Admin route guard.
//
// Every /admin/* page (except the login page itself) requires a valid
// `admin_session` JWT cookie. The cookie is set by the login route handler
// (src/app/api/admin-auth/login) from a token the backend issues, and is
// httpOnly so client JS never touches it — only this server-side middleware
// and the backend read it.
//
// We verify the HS256 signature and expiry here with the Web Crypto API
// (available in the Edge runtime) so no extra dependency is needed. The
// backend independently re-verifies the token + admin role on every admin API
// call, so this middleware is the UX gate and the backend is the hard gate.
import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";
const LOGIN_PATH = "/admin/login";

function base64UrlDecode(input: string): Uint8Array {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(
    normalized.length + ((4 - (normalized.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type AdminClaims = {
  sub?: string;
  role?: string;
  is_superuser?: boolean;
  exp?: number;
};

// Verify an HS256 JWT and return its claims, or null if invalid/expired.
async function verifyAdminToken(
  token: string,
  secret: string,
): Promise<AdminClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlDecode(signatureB64),
      new TextEncoder().encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;

    const claims = JSON.parse(
      new TextDecoder().decode(base64UrlDecode(payloadB64)),
    ) as AdminClaims;

    // Expiry (python-jose encodes exp as a Unix timestamp in seconds).
    if (typeof claims.exp === "number" && Date.now() / 1000 >= claims.exp) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest): NextResponse {
  // When behind nginx, use the public host from X-Forwarded-Host so the
  // browser receives a redirect to the real domain, not the internal one.
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = fwdHost
    ? `${fwdProto}://${fwdHost}`
    : request.nextUrl.origin;

  const loginUrl = new URL(LOGIN_PATH, origin);
  loginUrl.searchParams.set(
    "next",
    request.nextUrl.pathname + request.nextUrl.search,
  );
  return NextResponse.redirect(loginUrl);
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname, searchParams } = request.nextUrl;

  // The login page must stay public, otherwise there's no way in.
  if (pathname === LOGIN_PATH) {
    return NextResponse.next();
  }

  // Root path: only guard when there are no patient/doctor query params.
  // Personal links (?fileid=… or ?patid=… or ?doctorid=…) pass through so
  // patients and doctors can reach their view without an admin account.
  if (pathname === "/") {
    const hasPersonalLink =
      searchParams.has("fileid") ||
      searchParams.has("patid") ||
      searchParams.has("doctorid");
    if (hasPersonalLink) return NextResponse.next();
  }

  const secret = process.env.JWT_SECRET || "";
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!secret || !token) {
    return redirectToLogin(request);
  }

  const claims = await verifyAdminToken(token, secret);
  if (!claims || (claims.role !== "admin" && claims.is_superuser !== true)) {
    return redirectToLogin(request);
  }

  return NextResponse.next();
}

export const config = {
  // "/" is guarded when accessed without a personal-link query string.
  // "/admin/*" is always guarded (except /admin/login itself).
  matcher: ["/", "/admin/:path*"],
};
