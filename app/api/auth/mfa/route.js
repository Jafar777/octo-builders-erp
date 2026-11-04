import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCurrentUser } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { generateSecret, openSecret, otpauthUri, sealSecret, verifyTotp } from "@/lib/totp";
import { serializeLogin } from "@/lib/security";
import LoginEvent from "@/models/LoginEvent";
import User from "@/models/User";

// My sign-in security (Profile → Security): the authenticator app and my login history.
export async function GET() {
  const me = await getCurrentUser();
  if (!me) return forbidden();
  const user = await User.findById(me.id, { mfa: 1 }).lean();
  const logins = await LoginEvent.find({ user: me.id }).sort({ at: -1 }).limit(20).lean();
  return NextResponse.json({
    enabled: Boolean(user?.mfa?.enabled),
    enabledAt: user?.mfa?.enabledAt || null,
    required: Boolean(me.mfaRequired),
    logins: logins.map(serializeLogin),
  });
}

// { action: "setup" } → a new secret and its QR code (not active until confirmed)
// { action: "enable", code } → confirms the app works and turns it on
// { action: "disable", code } → turns it off (not while the role requires it)
export async function POST(request) {
  const me = await getCurrentUser();
  if (!me) return forbidden();
  const body = await readJson(request);
  const user = await User.findById(me.id);

  if (body.action === "setup") {
    const secret = generateSecret();
    user.mfa.pending = sealSecret(secret);
    await user.save();
    const uri = otpauthUri(secret, user.email);
    return NextResponse.json({ secret, qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }) });
  }

  if (body.action === "enable") {
    const secret = openSecret(user.mfa.pending);
    const counter = secret ? verifyTotp(secret, body.code) : null;
    if (counter === null) return fail("invalid_app_code");
    Object.assign(user.mfa, { enabled: true, secret: user.mfa.pending, pending: "", lastCounter: counter, enabledAt: new Date() });
    await user.save();
    await audit(me, "security.mfa_enabled", { entityType: "user", entityId: me.id, summary: me.email });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "disable") {
    if (me.mfaRequired) return fail("mfa_required_by_role", 409);
    if (verifyTotp(openSecret(user.mfa.secret), body.code) === null) return fail("invalid_app_code");
    Object.assign(user.mfa, { enabled: false, secret: "", pending: "", lastCounter: -1, enabledAt: null });
    await user.save();
    await audit(me, "security.mfa_disabled", { entityType: "user", entityId: me.id, summary: me.email });
    return NextResponse.json({ ok: true });
  }
  return fail("invalid_request");
}
