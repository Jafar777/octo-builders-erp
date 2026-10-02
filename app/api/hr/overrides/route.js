import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { OVERRIDE_STATUSES } from "@/lib/attendance";
import { hrMonthState } from "@/lib/hr";
import { canSeePerson } from "@/lib/hrAccess";
import AttendanceOverride from "@/models/AttendanceOverride";

// HR / GM correction of one day (answer 12: department heads can't approve these).
// Body: { userId, date, status: ""|OVERRIDE_STATUSES, exemptWarnings, bonus, note }
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "attendance.manage")) return forbidden();

  const body = await readJson(request);
  if (!isObjectId(body.userId) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "")) return fail("invalid_request");
  if (!(await canSeePerson(user, body.userId, "attendance.manage"))) return forbidden();
  if (body.status && !OVERRIDE_STATUSES.includes(body.status)) return fail("invalid_request");
  if ((await hrMonthState(body.date.slice(0, 7))).closed) return fail("month_closed", 409);

  const data = {
    status: body.status || "",
    exemptWarnings: Boolean(body.exemptWarnings),
    bonus: Math.max(0, Math.min(100000, Number(body.bonus) || 0)),
    note: String(body.note || "").slice(0, 500),
    by: user.id,
  };
  const empty = !data.status && !data.exemptWarnings && !data.bonus && !data.note;
  if (empty) await AttendanceOverride.deleteOne({ user: body.userId, date: body.date });
  else await AttendanceOverride.findOneAndUpdate({ user: body.userId, date: body.date }, { ...data, user: body.userId, date: body.date }, { upsert: true });

  await audit(user, "attendance.override", { entityType: "user", entityId: body.userId, summary: body.date, details: data });
  return NextResponse.json({ ok: true });
}
