import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { localParts } from "@/lib/attendance";
import { todayIn } from "@/lib/hr";
import { getSettings } from "@/lib/settings";
import RawPunch from "@/models/RawPunch";
import User from "@/models/User";

const MIN_GAP_MS = 5 * 60 * 1000;

// Today's punches for me + whether the in-system check-in is enabled.
export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const settings = await getSettings();
  const me = await User.findById(user.id, { badgeId: 1 }).lean();
  const tz = settings.hr.timezone;
  const today = todayIn(tz);
  const punches = me?.badgeId
    ? (await RawPunch.find({ badgeId: me.badgeId, time: { $gte: new Date(Date.now() - 36 * 3600000) } }).sort({ time: 1 }).lean()).filter(
        (p) => localParts(p.time, tz).date === today
      )
    : [];
  return NextResponse.json({
    enabled: Boolean(settings.hr.webCheckIn),
    hasBadge: Boolean(me?.badgeId),
    punches: punches.map((p) => ({ time: p.time, source: p.source })),
  });
}

// A check-in / check-out punch from the system (backup for the fingerprint device).
// The first punch of the day is the check-in, the last one the check-out.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const settings = await getSettings();
  if (!settings.hr.webCheckIn) return fail("web_checkin_disabled", 403);
  const me = await User.findById(user.id, { badgeId: 1 }).lean();
  if (!me?.badgeId) return fail("no_badge");
  if (await RawPunch.exists({ badgeId: me.badgeId, time: { $gt: new Date(Date.now() - MIN_GAP_MS) } })) return fail("punch_too_soon", 429);

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
  const punch = await RawPunch.create({ badgeId: me.badgeId, time: new Date(), source: "web", createdBy: user.id, note: ip ? `IP ${ip}` : "" });
  await audit(user, "attendance.web_punch", { entityType: "attendance", entityId: punch._id, summary: ip });
  return NextResponse.json({ punch: { time: punch.time, source: punch.source } }, { status: 201 });
}
