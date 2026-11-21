import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const SESSION_COOKIE = "octa_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function getSecretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("Missing JWT_SECRET environment variable");
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    return payload;
  } catch {
    return null;
  }
}

export async function setSessionCookie(token) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  // Other signed tokens (View as…, salary unlock) never count as a sign-in.
  return payload?.kind ? null : payload;
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE;

// "View as…" (CEO only): a second signed cookie naming the person shown, tied to the
// CEO's own account so it means nothing to anyone else. 8 hours at most.
export const VIEW_AS_COOKIE = "octa_view_as";
const VIEW_AS_MAX_AGE = 60 * 60 * 8;

export async function setViewAsCookie(realId, targetId) {
  const token = await new SignJWT({ kind: "view_as", sub: String(realId), as: String(targetId) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${VIEW_AS_MAX_AGE}s`)
    .sign(getSecretKey());
  const cookieStore = await cookies();
  cookieStore.set(VIEW_AS_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: VIEW_AS_MAX_AGE });
}

export async function clearViewAsCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(VIEW_AS_COOKIE);
}

// The person the CEO (`realId`) is viewing as, or null.
export async function getViewAs(realId) {
  const cookieStore = await cookies();
  const token = cookieStore.get(VIEW_AS_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  return payload?.kind === "view_as" && payload.sub === String(realId) && payload.as ? payload.as : null;
}
