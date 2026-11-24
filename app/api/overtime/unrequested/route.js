import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { attendanceForMonth, hrStaff, MONTH_RE, todayIn } from "@/lib/hr";
import { notify } from "@/lib/notify";
import { canDecideAny, isOvertimeAdmin } from "@/lib/overtime";
import { isTopRole } from "@/lib/permissions";
import { loadLinks, reachesPerson } from "@/lib/reporting";
import { getSettings } from "@/lib/settings";
import { fromLocal } from "@/lib/attendance";
import OvertimeRequest from "@/models/OvertimeRequest";
import Task from "@/models/Task";
import TaskActivity from "@/models/TaskActivity";

const idStr = (v) => (v ? v.toString() : null);
const WORK = ["started", "resumed", "submitted", "paused"];

// The people whose overtime `user` decides: everyone (CEO) or their people (their
// departments', minus anyone moved to another manager in the chart, plus anyone moved
// to them — lib/reporting.js).
async function decidable(user) {
  const staff = (await hrStaff({ status: "active" })).filter((s) => s.id !== user.id && !isTopRole(s.role));
  if (isOvertimeAdmin(user)) return staff;
  const ctx = await loadLinks();
  return staff.filter((s) => reachesPerson(user, s, ctx));
}

// ?month=YYYY-MM → days someone worked past their hours without asking for overtime,
// with the tasks they worked on that day. The manager approves (it's paid) or rejects.
export async function GET(request) {
  const user = await requireStaff();
  if (!user || !canDecideAny(user)) return forbidden();
  const settings = await getSettings();
  const param = new URL(request.url).searchParams.get("month");
  const month = MONTH_RE.test(param || "") ? param : todayIn(settings.hr.timezone).slice(0, 7);
  const staff = await decidable(user);
  const attendance = await attendanceForMonth(staff, month, settings);
  const asked = await OvertimeRequest.find({ user: { $in: staff.map((s) => s.id) }, date: { $regex: `^${month}` } }, { user: 1, date: 1 }).lean();
  const has = new Set(asked.map((a) => `${idStr(a.user)}|${a.date}`));
  const today = todayIn(settings.hr.timezone);

  const items = [];
  for (const s of staff) {
    for (const d of attendance[s.id]?.days || []) {
      if (d.date >= today || !(d.unapprovedOvertime >= 0.25) || has.has(`${s.id}|${d.date}`)) continue;
      items.push({ userId: s.id, name: s.name, avatarUrl: s.avatarUrl, date: d.date, hours: d.unapprovedOvertime, tasks: [] });
    }
  }
  // What they worked on that day: tasks they started, resumed, paused or handed in.
  if (items.length) {
    const tz = settings.hr.timezone;
    const acts = await TaskActivity.find(
      { actor: { $in: [...new Set(items.map((i) => i.userId))] }, type: { $in: WORK }, createdAt: { $gte: fromLocal(`${month}-01`, "00:00", tz), $lt: new Date(Date.now()) } },
      { task: 1, actor: 1, createdAt: 1 }
    ).lean();
    const tasks = await Task.find({ _id: { $in: [...new Set(acts.map((a) => idStr(a.task)))] } }, { number: 1, title: 1 }).lean();
    const byId = Object.fromEntries(tasks.map((t) => [idStr(t._id), t]));
    for (const it of items) {
      const from = fromLocal(it.date, "00:00", tz).getTime();
      const to = from + 24 * 3600 * 1000;
      const ids = [...new Set(acts.filter((a) => idStr(a.actor) === it.userId && a.createdAt >= from && a.createdAt < to).map((a) => idStr(a.task)))];
      it.tasks = ids.map((id) => byId[id]).filter(Boolean).map((t) => ({ id: idStr(t._id), number: t.number, title: t.title }));
    }
  }
  items.sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  return NextResponse.json({ month, items });
}

// { userId, date, hours, decision: "approve" | "reject", note } → recorded as a decided
// overtime request "without a request", so attendance and payroll count it (or not).
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !canDecideAny(user)) return forbidden();
  const body = await readJson(request);
  if (!isObjectId(body.userId) || !/^\d{4}-\d{2}-\d{2}$/.test(body.date || "") || !["approve", "reject"].includes(body.decision)) return fail("invalid_request");
  const person = (await decidable(user)).find((s) => s.id === body.userId);
  if (!person) return forbidden();
  const hours = Math.round(Number(body.hours) * 4) / 4;
  if (body.decision === "approve" && !(hours >= 0.25 && hours <= 16)) return fail("invalid_hours");
  if (await OvertimeRequest.exists({ user: body.userId, date: body.date })) return fail("overtime_decided", 409);
  const approve = body.decision === "approve";
  const saved = await OvertimeRequest.create({
    user: body.userId,
    department: person.department || null,
    date: body.date,
    hours: Math.max(0.5, hours || 0.5),
    reason: "بدون طلب / without a request",
    status: approve ? "approved" : "rejected",
    approvedHours: approve ? hours : 0,
    decidedBy: user.id,
    decidedAt: new Date(),
    decisionNote: String(body.note || "").slice(0, 500),
  });
  await audit(user, approve ? "overtime.approved" : "overtime.rejected", { entityType: "overtime", entityId: saved._id, summary: `${person.name} ${body.date} ${approve ? hours : 0}h` });
  if (approve) {
    await notify({
      type: "overtime.approved",
      recipients: [body.userId],
      actor: user,
      params: { actor: user.name || user.email, hours, date: body.date },
      link: "/dashboard/orders?type=overtime",
      entityType: "overtime",
      entityId: saved._id,
    });
  }
  return NextResponse.json({ ok: true });
}
