import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson, serializeDocument } from "@/lib/hrAccess";
import { salaryUnlocked } from "@/lib/salaryLock";
import { getSettings } from "@/lib/settings";
import SalaryHistory from "@/models/SalaryHistory";
import User from "@/models/User";
import { pickName, viewerLang } from "@/lib/personName";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const numOrNull = (v, min, max) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= min && n <= max ? n : undefined;
};

// Personal working hours; blank fields fall back to the company hours.
function parseSchedule(v) {
  const out = { custom: Boolean(v?.custom) };
  for (const f of ["workStart", "workEnd"]) {
    const x = String(v?.[f] || "");
    if (x && !TIME.test(x)) return null;
    out[f] = x;
  }
  const limits = { dailyHours: [1, 24], ramadanHours: [1, 24], minHours: [0, 24], graceMinutes: [0, 240] };
  for (const [f, [min, max]] of Object.entries(limits)) {
    const n = numOrNull(v?.[f], min, max);
    if (n === undefined) return null;
    out[f] = n;
  }
  return out;
}

const scheduleOut = (s) => ({
  custom: Boolean(s?.custom),
  workStart: s?.workStart || "",
  workEnd: s?.workEnd || "",
  dailyHours: s?.dailyHours ?? null,
  ramadanHours: s?.ramadanHours ?? null,
  minHours: s?.minHours ?? null,
  graceMinutes: s?.graceMinutes ?? null,
});

// HR profile: contract, leave allowance, badge, KPI exclusion, skills, working hours
// (+ salary history for payroll.view).
export async function GET(request, { params }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!user || !(await canSeePerson(user, id, "attendance.view"))) return forbidden();
  const u = await User.findById(id).lean();
  if (!u) return notFound();

  const mayPay = id === user.id || (await canSeePerson(user, id, "payroll.view"));
  const canPay = mayPay && (await salaryUnlocked(user));
  const salaries = canPay ? await SalaryHistory.find({ user: id }).sort({ from: -1 }).lean() : [];
  // Emergency contact and documents (ID copies, contracts) only for HR and the person.
  const canEditFile = id === user.id || (hasPermission(user, "attendance.manage") && (await canSeePerson(user, id, "attendance.manage")));
  const settings = await getSettings();
  return NextResponse.json({
    profile: {
      id,
      name: pickName(u, await viewerLang()),
      badgeId: u.badgeId || "",
      contractStart: u.contractStart || "",
      contractEnd: u.contractEnd || "",
      annualLeaveDays: u.annualLeaveDays ?? 21,
      kpiExcluded: Boolean(u.kpiExcluded),
      phone: u.phone || "",
      skills: u.skills || [],
      workSchedule: scheduleOut(u.workSchedule),
      emergencyContact: canEditFile
        ? { name: u.emergencyContact?.name || "", phone: u.emergencyContact?.phone || "", relation: u.emergencyContact?.relation || "" }
        : null,
    },
    documents: canEditFile ? (u.documents || []).map(serializeDocument) : [],
    canEditFile,
    salaries: salaries.map((s) => ({ id: s._id.toString(), amount: s.amount, currency: s.currency, from: s.from, note: s.note })),
    canPay,
    salaryLocked: mayPay && !canPay,
    companyWorkHours: settings.workHours,
  });
}

export async function PATCH(request, { params }) {
  const user = await requireStaff();
  const { id } = await params;
  if (!user || !isObjectId(id)) return forbidden();
  const body = await readJson(request);
  const isHr = hasPermission(user, "attendance.manage") && (await canSeePerson(user, id, "attendance.manage"));

  // Employees keep their own emergency contact up to date; everything else is HR's.
  const changes = {};
  if (body.emergencyContact && (isHr || id === user.id)) {
    const c = body.emergencyContact;
    changes.emergencyContact = {
      name: String(c.name || "").trim().slice(0, 100),
      phone: String(c.phone || "").trim().slice(0, 40),
      relation: String(c.relation || "").trim().slice(0, 60),
    };
  }
  if (!isHr) {
    if (!changes.emergencyContact) return forbidden();
    await User.findByIdAndUpdate(id, changes);
    await audit(user, "hr.profile_updated", { entityType: "user", entityId: id, details: changes });
    return NextResponse.json({ ok: true });
  }

  for (const f of ["contractStart", "contractEnd"]) {
    if (body[f] !== undefined) {
      if (body[f] && !DATE.test(body[f])) return fail("invalid_date");
      changes[f] = body[f] || "";
    }
  }
  if (body.annualLeaveDays !== undefined) changes.annualLeaveDays = Math.max(0, Math.min(60, Number(body.annualLeaveDays) || 0));
  if (typeof body.kpiExcluded === "boolean") changes.kpiExcluded = body.kpiExcluded;
  if (typeof body.phone === "string") changes.phone = body.phone.trim().slice(0, 30);
  if (Array.isArray(body.skills)) {
    const seen = new Set();
    changes.skills = body.skills
      .map((x) => String(x || "").trim().slice(0, 40))
      .filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()))
      .slice(0, 30);
  }
  if (body.workSchedule !== undefined) {
    const schedule = parseSchedule(body.workSchedule);
    if (!schedule) return fail("invalid_schedule");
    changes.workSchedule = schedule;
  }
  if (typeof body.badgeId === "string") changes.badgeId = body.badgeId.trim().slice(0, 20);
  if (changes.badgeId && (await User.exists({ badgeId: changes.badgeId, _id: { $ne: id } }))) return fail("badge_in_use", 409);

  await User.findByIdAndUpdate(id, changes);
  await audit(user, "hr.profile_updated", { entityType: "user", entityId: id, details: changes });
  return NextResponse.json({ ok: true });
}
