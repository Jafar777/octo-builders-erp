import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { readMfaTicket, recordLogin } from "@/lib/security";
import { openSecret, verifyTotp } from "@/lib/totp";
import User from "@/models/User";

// Second sign-in step: the ticket from verify-otp plus the authenticator app's code.
export async function POST(request) {
  const { ticket, code } = await request.json().catch(() => ({}));
  const userId = await readMfaTicket(ticket);
  if (!userId) return NextResponse.json({ error: "mfa_expired" }, { status: 400 });

  await connectDB();
  const user = await User.findById(userId);
  if (!user?.mfa?.enabled) return NextResponse.json({ error: "mfa_expired" }, { status: 400 });

  const counter = verifyTotp(openSecret(user.mfa.secret), code, Date.now(), user.mfa.lastCounter ?? -1);
  if (counter === null) {
    await recordLogin({ user: user._id, email: user.email, method: "email+app", success: false, reason: "invalid_app_code" });
    return NextResponse.json({ error: "invalid_app_code" }, { status: 400 });
  }

  user.mfa.lastCounter = counter;
  user.lastLoginAt = new Date();
  await user.save();
  await recordLogin({ user: user._id, email: user.email, method: "email+app" });

  await setSessionCookie(await createSessionToken({ sub: user._id.toString(), email: user.email, role: user.role }));
  return NextResponse.json({ user: { id: user._id.toString(), email: user.email, name: user.name, avatarUrl: user.avatarUrl, role: user.role } });
}
