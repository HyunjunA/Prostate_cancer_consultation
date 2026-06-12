// Admin logout route handler — clears the httpOnly admin_session cookie.
// The JWT is stateless, so logout is purely cookie removal on this side.
import { NextResponse } from "next/server";

const COOKIE_NAME = "admin_session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
