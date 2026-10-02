import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden } from "@/lib/apiUtils";
import { generateOtpCode, hashOtpCode, OTP_TTL_MS } from "@/lib/otp";
import { sendOtpEmail } from "@/lib/resend";
import OtpCode from "@/models/OtpCode";

// Emails a code that unlocks salary figures for 30 minutes.
export async function POST() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const recent = await OtpCode.findOne({ email: user.email, purpose: "salary", createdAt: { $gt: new Date(Date.now() - 30000) } }).lean();
  if (recent) return fail("wait_before_resend", 429);

  const code = generateOtpCode();
  await OtpCode.deleteMany({ email: user.email, purpose: "salary" });
  await OtpCode.create({ email: user.email, purpose: "salary", code: hashOtpCode(code), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  try {
    await sendOtpEmail({ to: user.email, code, purpose: "salary" });
  } catch (err) {
    console.error("salary code email error", err?.message || err);
    return fail("email_failed", 502);
  }
  return NextResponse.json({ ok: true });
}
