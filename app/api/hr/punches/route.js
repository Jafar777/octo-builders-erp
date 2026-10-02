import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hrMonthState, todayIn } from "@/lib/hr";
import { canSeePerson } from "@/lib/hrAccess";
import { localParts } from "@/lib/attendance";
import { getSettings } from "@/lib/settings";
import RawPunch from "@/models/RawPunch";
import User from "@/models/User";

// Manual punch by HR (device missed someone). Body: { userId, time (ISO), note }
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();
  const body = await readJson(request);
  if (!isObjectId(body.userId)) return fail("invalid_request");
  if (!(await canSeePerson(user, body.userId, "attendance.manage"))) return forbidden();

  const target = await User.findById(body.userId, { badgeId: 1 }).lean();
  if (!target?.badgeId) return fail("badge_required");
  const time = new Date(body.time);
  if (Number.isNaN(time.getTime()) || time > new Date(Date.now() + 60000)) return fail("invalid_date");

  const settings = await getSettings();
  const date = localParts(time, settings.hr.timezone).date;
  if ((await hrMonthState(date.slice(0, 7))).closed) return fail("month_closed", 409);
  if (date > todayIn(settings.hr.timezone)) return fail("invalid_date");

  try {
    await RawPunch.create({ badgeId: target.badgeId, time, source: "manual", createdBy: user.id, note: String(body.note || "").slice(0, 300) });
  } catch {
    return fail("duplicate_punch", 409);
  }
  await audit(user, "attendance.manual_punch", { entityType: "user", entityId: body.userId, summary: time.toISOString() });
  return NextResponse.json({ ok: true }, { status: 201 });
}
