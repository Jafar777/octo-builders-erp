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

// While the CEO views the dashboard as someone else ("View as…"), that person's chats
// and their own security settings stay closed.
const VIEW_AS_BLOCKED = ["/api/messages", "/api/auth/mfa", "/api/auth/salary-code", "/api/auth/salary-unlock"];

export async function proxy(request) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    if (!request.cookies.get("octa_view_as")) return NextResponse.next();
    if (VIEW_AS_BLOCKED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
      return NextResponse.json({ error: "view_as_blocked" }, { status: 403 });
    }
    // Every change made while viewing as someone is logged (lib/currentUser.js).
    const headers = new Headers(request.headers);
    headers.delete("x-octa-view-as-write");
    const bookkeeping = ["/api/notifications", "/api/view-as", "/api/realtime"].some((p) => pathname.startsWith(p));
    if (request.method !== "GET" && request.method !== "HEAD" && !bookkeeping) headers.set("x-octa-view-as-write", `${request.method} ${pathname}`);
    return NextResponse.next({ request: { headers } });
  }
  const authed = await isAuthenticated(request);
  if (!authed) {
    const url = new URL("/auth", request.url);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
