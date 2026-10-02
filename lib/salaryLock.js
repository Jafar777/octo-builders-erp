// Salary figures need a fresh email code (replaces the Excel password cell). After
// the code is confirmed, a short-lived cookie keeps salaries visible for 30 minutes.
// The GM can switch this off in HR settings (hr.salaryCode).
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/settings";

const COOKIE = "octa_salary";
export const SALARY_UNLOCK_MINUTES = 30;

const key = () => new TextEncoder().encode(process.env.JWT_SECRET);

export async function setSalaryUnlock(userId) {
  const token = await new SignJWT({ sub: userId, kind: "salary" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SALARY_UNLOCK_MINUTES}m`)
    .sign(key());
  const store = await cookies();
  store.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SALARY_UNLOCK_MINUTES * 60,
  });
}

export async function clearSalaryUnlock() {
  (await cookies()).delete(COOKIE);
}

// True when salaries may be shown to this user right now.
export async function salaryUnlocked(user) {
  const settings = await getSettings();
  if (settings.hr.salaryCode === false) return true;
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, key());
    return payload.kind === "salary" && payload.sub === user.id;
  } catch {
    return false;
  }
}
