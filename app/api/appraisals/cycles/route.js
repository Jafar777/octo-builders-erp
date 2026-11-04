import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { departmentManagers } from "@/lib/leave";
import { notify } from "@/lib/notify";
import { outsideRoleKeys } from "@/lib/scope";
import Appraisal, { AppraisalCycle } from "@/models/Appraisal";
import User from "@/models/User";

const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// Opens a cycle: { name, from, to, dueDate, selfReview }. Every employee (not the
// restricted or hidden accounts, not the CEO) gets a review by their department manager,
// or by the person opening the cycle when the department has none.
export async function POST(request) {
  const user = await requirePermission("appraisals.manage");
  if (!user) return forbidden();
  const b = await readJson(request);
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name || !dateOk(b.from) || !dateOk(b.to) || b.to < b.from) return fail("invalid_request");
  const cycle = await AppraisalCycle.create({ name, from: b.from, to: b.to, dueDate: dateOk(b.dueDate) ? b.dueDate : "", selfReview: b.selfReview !== false, createdBy: user.id });
  const staff = await User.find({ status: "active", role: { $nin: [...(await outsideRoleKeys()), "ceo"] } }, { department: 1 }).lean();
  const docs = [];
  for (const s of staff) {
    const managers = await departmentManagers(s.department, s._id.toString());
    docs.push({ cycle: cycle._id, employee: s._id, reviewer: managers[0] || user.id });
  }
  if (docs.length) await Appraisal.insertMany(docs, { ordered: false }).catch(() => {});
  await audit(user, "appraisals.cycle_opened", { entityType: "appraisal_cycle", entityId: cycle._id, summary: `${name} (${docs.length})` });
  await notify({
    type: "appraisal.opened",
    recipients: [...new Set(docs.flatMap((d) => [String(d.employee), String(d.reviewer)]))].filter((id) => id !== user.id),
    actor: user,
    params: { name, date: cycle.dueDate || cycle.to },
    link: "/dashboard/appraisals",
    entityType: "appraisal_cycle",
    entityId: cycle._id,
  });
  return NextResponse.json({ id: cycle._id.toString(), reviews: docs.length }, { status: 201 });
}
