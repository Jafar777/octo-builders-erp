import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SESSION_COOKIE = "octa_session";

async function isAuthenticated(request) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(process.env.JWT_SECRET));
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request) {
  const authed = await isAuthenticated(request);
  if (!authed) {
    const url = new URL("/auth", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
