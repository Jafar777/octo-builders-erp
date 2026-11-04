import { SignJWT, jwtVerify } from "jose";
import { headers } from "next/headers";
import LoginEvent from "@/models/LoginEvent";

// Sign-in safety: the login history and the short-lived "email code passed, now the
// authenticator code" ticket.

const ticketKey = () => new TextEncoder().encode(`mfa:${process.env.JWT_SECRET || ""}`);

// Valid 5 minutes. Carries no `sub`, so it can never pass as a session.
export async function createMfaTicket(userId) {
  return new SignJWT({ mfa: String(userId) }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("5m").sign(ticketKey());
}

export async function readMfaTicket(ticket) {
  try {
    const { payload } = await jwtVerify(String(ticket || ""), ticketKey());
    return payload.mfa || null;
  } catch {
    return null;
  }
}

// Never throws: a failed write must not break the sign-in.
export async function recordLogin({ user = null, email = "", method = "email", success = true, reason = "" }) {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") || h.get("x-real-ip") || "").split(",")[0].trim();
    await LoginEvent.create({ user, email, method, success, reason, ip, userAgent: (h.get("user-agent") || "").slice(0, 300) });
  } catch (err) {
    console.error("login event", err);
  }
}

// A readable device name from the user agent ("Chrome on Windows").
export function deviceName(ua = "") {
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}

export function serializeLogin(e) {
  return {
    id: e._id.toString(),
    at: e.at,
    ip: e.ip,
    device: deviceName(e.userAgent),
    method: e.method,
    success: e.success,
    reason: e.reason,
    email: e.email,
    user: e.user ? e.user.toString() : null,
  };
}
