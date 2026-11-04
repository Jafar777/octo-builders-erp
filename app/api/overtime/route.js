import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { MONTH_RE, todayIn } from "@/lib/hr";
import { departmentManagers } from "@/lib/leave";
import { notify } from "@/lib/notify";
import { canAskOvertime, canDecideAny, isOvertimeAdmin, overtimeScope, serializeOvertime } from "@/lib/overtime";
import { viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import OvertimeRequest from "@/models/OvertimeRequest";
import User from "@/models/User";
import { inDepartments } from "@/lib/scope";

const idStr = (v) => (v ? v.toString() : null);
const PERSON = { name: 1, nameAr: 1, email: 1, avatarUrl: 1 };

// The Overtime requests page. ?tab=mine | queue | history, ?month=YYYY-MM (history).
//   mine:    my requests (and whether I can still ask today)
//   queue:   requests waiting for my decision (department managers, the CEO)
//   history: decided requests of the month I may see, with each person's approved total
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") || "mine";
  const settings = await getSettings();
  const today = todayIn(settings.hr.timezone);
  const month = MONTH_RE.test(params.get("month") || "") ? params.get("month") : today.slice(0, 7);

  let query;
  if (tab === "queue") {
    if (!canDecideAny(user)) return forbidden();
    query = { status: "pending", user: { $ne: user.id }, ...(isOvertimeAdmin(user) ? {} : inDepartments(user)) };
  } else if (tab === "history") {
    query = { ...overtimeScope(user), date: { $gte: `${month}-01`, $lte: `${month}-31` }, status: { $in: ["approved", "rejected"] } };
  } else {
    query = { user: user.id };
  }
  const list = await OvertimeRequest.find(query).sort({ date: -1, createdAt: -1 }).limit(500).lean();
  const ids = [...new Set(list.flatMap((r) => [idStr(r.user), idStr(r.decidedBy)]).filter(Boolean))];
  const people = Object.fromEntries((await User.find({ _id: { $in: ids } }, PERSON).lean()).map((u) => [idStr(u._id), u]));
  const lang = await viewerLang();
  const requests = list.map((r) => serializeOvertime(r, people, lang, user));

  // History: each person's approved hours in the month, the most first.
  let totals = null;
  if (tab === "history") {
    const by = {};
    for (const r of requests) {
      const row = (by[r.user.id] ||= { user: r.user, approvedHours: 0, approved: 0, rejected: 0 });
      if (r.status === "approved") {
        row.approvedHours += r.approvedHours;
        row.approved += 1;
      } else row.rejected += 1;
    }
    totals = Object.values(by)
      .map((x) => ({ ...x, approvedHours: Math.round(x.approvedHours * 100) / 100 }))
      .sort((a, b) => b.approvedHours - a.approvedHours);
  }

  return NextResponse.json({
    tab,
    month,
    today,
    requests,
    totals,
    canAsk: canAskOvertime(user),
    canDecide: canDecideAny(user),
    // Today's request, if any: asking again updates it while it's pending.
    todayRequest: tab === "mine" ? requests.find((r) => r.date === today) || null : undefined,
  });
}

// Ask for overtime — for today only, never in advance. { hours, reason }
// Asking again the same day changes the pending request.
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !canAskOvertime(user)) return forbidden();
  const body = await readJson(request);
  const hours = Math.round(Number(body.hours) * 2) / 2;
  if (!(hours >= 0.5 && hours <= 16)) return fail("invalid_hours");
  const reason = String(body.reason || "").trim().slice(0, 1000);
  const settings = await getSettings();
  const today = todayIn(settings.hr.timezone);

  const existing = await OvertimeRequest.findOne({ user: user.id, date: today });
  if (existing && existing.status !== "pending") return fail("overtime_decided", 409);
  const saved = existing
    ? Object.assign(existing, { hours, reason })
    : new OvertimeRequest({ user: user.id, department: user.department || null, date: today, hours, reason });
  await saved.save();

  // Their department manager decides (the CEO when the department has none).
  let recipients = await departmentManagers(user.department, user.id);
  if (!recipients.length) recipients = (await User.find({ role: "ceo", status: "active" }, { _id: 1 }).lean()).map((u) => idStr(u._id));
  if (!existing) {
    await notify({
      type: "overtime.requested",
      recipients,
      actor: user,
      params: { actor: user.name || user.email, hours },
      link: "/dashboard/overtime?tab=queue",
      entityType: "overtime",
      entityId: saved._id,
    });
  }
  return NextResponse.json({ ok: true, id: idStr(saved._id) }, { status: existing ? 200 : 201 });
}
