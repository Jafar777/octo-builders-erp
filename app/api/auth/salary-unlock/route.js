import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hashOtpCode, OTP_MAX_ATTEMPTS } from "@/lib/otp";
import { clearSalaryUnlock, setSalaryUnlock } from "@/lib/salaryLock";
import OtpCode from "@/models/OtpCode";

// Body: { code } → salaries visible for 30 minutes on this browser.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const code = String((await readJson(request)).code || "").trim();
  const otp = await OtpCode.findOne({ email: user.email, purpose: "salary" }).sort({ createdAt: -1 });
  if (!otp) return fail("code_not_found");
  if (otp.expiresAt < new Date()) {
    await OtpCode.deleteMany({ email: user.email, purpose: "salary" });
    return fail("code_expired");
  }
  if (otp.attempts >= OTP_MAX_ATTEMPTS) {
    await OtpCode.deleteMany({ email: user.email, purpose: "salary" });
    return fail("too_many_attempts", 429);
  }
  if (otp.code !== hashOtpCode(code)) {
    otp.attempts += 1;
    await otp.save();
    return fail("invalid_code");
  }
  await OtpCode.deleteMany({ email: user.email, purpose: "salary" });
  await setSalaryUnlock(user.id);
  await audit(user, "payroll.unlocked", { entityType: "user", entityId: user.id, summary: "salary view unlocked" });
  return NextResponse.json({ ok: true });
}

// Lock again now.
export async function DELETE() {
  const user = await requireStaff();
  if (!user) return forbidden();
  await clearSalaryUnlock();
  return NextResponse.json({ ok: true });
}
