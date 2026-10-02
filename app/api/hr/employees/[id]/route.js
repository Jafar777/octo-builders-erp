import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canSeePerson, serializeDocument } from "@/lib/hrAccess";
import { salaryUnlocked } from "@/lib/salaryLock";
import SalaryHistory from "@/models/SalaryHistory";
import User from "@/models/User";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// HR profile: contract, leave allowance, badge, KPI exclusion (+ salary history for payroll.view).
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
  return NextResponse.json({
    profile: {
      id,
      name: u.name || u.email,
      badgeId: u.badgeId || "",
      contractStart: u.contractStart || "",
      contractEnd: u.contractEnd || "",
      annualLeaveDays: u.annualLeaveDays ?? 21,
      kpiExcluded: Boolean(u.kpiExcluded),
      emergencyContact: canEditFile
        ? { name: u.emergencyContact?.name || "", phone: u.emergencyContact?.phone || "", relation: u.emergencyContact?.relation || "" }
        : null,
    },
    documents: canEditFile ? (u.documents || []).map(serializeDocument) : [],
    canEditFile,
    salaries: salaries.map((s) => ({ id: s._id.toString(), amount: s.amount, currency: s.currency, from: s.from, note: s.note })),
    canPay,
    salaryLocked: mayPay && !canPay,
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
  if (typeof body.badgeId === "string") changes.badgeId = body.badgeId.trim().slice(0, 20);
  if (changes.badgeId && (await User.exists({ badgeId: changes.badgeId, _id: { $ne: id } }))) return fail("badge_in_use", 409);

  await User.findByIdAndUpdate(id, changes);
  await audit(user, "hr.profile_updated", { entityType: "user", entityId: id, details: changes });
  return NextResponse.json({ ok: true });
}
