import { NextResponse } from "next/server";
import { getCurrentUser, requirePermission } from "@/lib/currentUser";
import { forbidden, readJson } from "@/lib/apiUtils";
import { recordError } from "@/lib/errorLog";
import { serializeLogin } from "@/lib/security";
import ErrorLog from "@/models/ErrorLog";
import LoginEvent from "@/models/LoginEvent";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";
import User from "@/models/User";

const idStr = (v) => (v ? v.toString() : null);

// The System page: errors (open first) and the company's recent sign-ins.
// ?resolved=1 shows resolved errors too.
export async function GET(request) {
  const user = await requirePermission("system.health");
  if (!user) return forbidden();
  const showResolved = new URL(request.url).searchParams.get("resolved") === "1";
  const [errors, logins] = await Promise.all([
    ErrorLog.find(showResolved ? {} : { resolvedAt: null }).sort({ lastAt: -1 }).limit(200).lean(),
    LoginEvent.find({}).sort({ at: -1 }).limit(100).lean(),
  ]);
  const ids = [...new Set([...errors.map((e) => idStr(e.lastUser)), ...logins.map((l) => idStr(l.user))].filter(Boolean))];
  const lang = await viewerLang();
  const names = Object.fromEntries((await User.find({ _id: { $in: ids } }, NAME_FIELDS).lean()).map((u) => [idStr(u._id), pickName(u, lang)]));
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  return NextResponse.json({
    errors: errors.map((e) => ({
      id: idStr(e._id),
      source: e.source,
      message: e.message,
      stack: e.stack,
      route: e.route,
      path: e.path,
      count: e.count,
      firstAt: e.firstAt,
      lastAt: e.lastAt,
      lastUser: names[idStr(e.lastUser)] || null,
      resolvedAt: e.resolvedAt,
    })),
    logins: logins.map((l) => ({ ...serializeLogin(l), name: names[idStr(l.user)] || l.email })),
    stats: {
      open: await ErrorLog.countDocuments({ resolvedAt: null }),
      last24h: await ErrorLog.countDocuments({ lastAt: { $gte: since }, resolvedAt: null }),
      failedLogins24h: await LoginEvent.countDocuments({ at: { $gte: since }, success: false }),
      logins24h: await LoginEvent.countDocuments({ at: { $gte: since }, success: true }),
    },
  });
}

// A browser error from the dashboard's error screen. Signed-in users only.
export async function POST(request) {
  const user = await getCurrentUser();
  if (!user) return forbidden();
  const body = await readJson(request);
  await recordError({ source: "browser", message: body.message, stack: body.stack, path: body.path, user: user.id });
  return NextResponse.json({ ok: true });
}
