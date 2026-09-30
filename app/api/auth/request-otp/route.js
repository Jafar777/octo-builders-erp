import { NextResponse } from "next/server";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import OtpCode from "@/models/OtpCode";
import { isEmailDomainAllowed, isValidEmail } from "@/lib/emailWhitelist";
import { generateOtpCode, hashOtpCode, OTP_TTL_MS } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/resend";

export async function POST(request) {
  try {
    const { email: rawEmail, purpose, name } = await request.json();
    const email = (rawEmail || "").trim().toLowerCase();

    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }

    if (!["login", "signup"].includes(purpose)) {
      return NextResponse.json({ error: "invalid_purpose" }, { status: 400 });
    }

    if (!isEmailDomainAllowed(email)) {
      return NextResponse.json({ error: "domain_not_allowed" }, { status: 403 });
    }

    await connectDB();

    const existingUser = await User.findOne({ email });

    if (purpose === "signup" && existingUser) {
      return NextResponse.json({ error: "account_exists" }, { status: 409 });
    }

    if (purpose === "login" && !existingUser) {
      return NextResponse.json({ error: "account_not_found" }, { status: 404 });
    }

    const code = generateOtpCode();

    await OtpCode.deleteMany({ email, purpose });
    await OtpCode.create({
      email,
      purpose,
      name: purpose === "signup" ? (name || "").trim().slice(0, 80) : "",
      code: hashOtpCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    });

    await sendOtpEmail({ to: email, code, purpose });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("request-otp error", err);
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
