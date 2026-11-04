import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import OtpCode from "@/models/OtpCode";
import { isValidEmail } from "@/lib/emailWhitelist";
import { hashOtpCode, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { ensureErpSeeded } from "@/lib/erpSeed";
import { notify, usersWithPermission } from "@/lib/notify";
import { audit } from "@/lib/audit";
import { createMfaTicket, recordLogin } from "@/lib/security";

export async function POST(request) {
  try {
    const { email: rawEmail, code, purpose } = await request.json();
    const email = (rawEmail || "").trim().toLowerCase();

    if (!isValidEmail(email) || !code || !["login", "signup"].includes(purpose)) {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }

    await connectDB();

    const otp = await OtpCode.findOne({ email, purpose }).sort({ createdAt: -1 });

    if (!otp) {
      return NextResponse.json({ error: "code_not_found" }, { status: 400 });
    }

    if (otp.expiresAt < new Date()) {
      await OtpCode.deleteMany({ email, purpose });
      if (purpose === "login") await recordLogin({ email, success: false, reason: "expired" });
      return NextResponse.json({ error: "code_expired" }, { status: 400 });
    }

    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      await OtpCode.deleteMany({ email, purpose });
      if (purpose === "login") await recordLogin({ email, success: false, reason: "too_many_attempts" });
      return NextResponse.json({ error: "too_many_attempts" }, { status: 429 });
    }

    if (otp.code !== hashOtpCode(String(code).trim())) {
      otp.attempts += 1;
      await otp.save();
      if (purpose === "login") await recordLogin({ email, success: false, reason: "invalid_code" });
      return NextResponse.json({ error: "invalid_code" }, { status: 400 });
    }

    await ensureErpSeeded();
    let user = await User.findOne({ email });

    if (purpose === "signup") {
      if (!user) {
        // The very first account becomes the general manager; everyone else waits
        // for the GM to assign a role.
        const isFirstUser = (await User.countDocuments()) === 0;
        user = await User.create({
          email,
          name: otp.name || "",
          role: isFirstUser ? "ceo" : "user",
        });
        await audit(user._id, "user.signed_up", {
          entityType: "user",
          entityId: user._id,
          summary: email,
        });
        if (!isFirstUser) {
          await notify({
            type: "user.signup",
            recipients: await usersWithPermission("users.manage"),
            params: { name: user.name || email },
            link: "/dashboard/staff?filter=pending",
            entityType: "user",
            entityId: user._id,
          });
        }
      }
    } else if (!user) {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }

    await OtpCode.deleteMany({ email, purpose });

    // Authenticator app turned on: the email code alone isn't enough. The second step
    // (/api/auth/verify-mfa) finishes the sign-in.
    if (user.mfa?.enabled) {
      return NextResponse.json({ mfa: true, ticket: await createMfaTicket(user._id) });
    }

    user.lastLoginAt = new Date();
    await user.save();
    await recordLogin({ user: user._id, email, method: "email" });

    const token = await createSessionToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    await setSessionCookie(token);

    return NextResponse.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("verify-otp error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
