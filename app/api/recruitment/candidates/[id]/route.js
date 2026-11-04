import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { isTopRole } from "@/lib/permissions";
import { nextNumber } from "@/models/Counter";
import { Candidate, CANDIDATE_STAGES, JobOpening } from "@/models/Recruitment";
import Role from "@/models/Role";
import Task from "@/models/Task";
import User from "@/models/User";

const dateOk = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "");

// Fields, { stage }, { note }, { interview: { date, with: [ids], rating, note } },
// { hire: { startDate, role, onboarding: [{ title, assignee }] } }
export async function PATCH(request, { params }) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const c = await Candidate.findById(id);
  if (!c) return notFound();
  const b = await readJson(request);

  for (const [k, n] of [["name", 150], ["email", 150], ["phone", 40], ["source", 80], ["rejectReason", 300]]) if (b[k] !== undefined) c[k] = String(b[k] || "").trim().slice(0, n);
  for (const k of ["cvUrl", "portfolioUrl"]) if (b[k] !== undefined) c[k] = /^https?:\/\//.test(String(b[k] || "")) ? String(b[k]).slice(0, 500) : "";
  if (b.rating !== undefined) c.rating = Math.min(5, Math.max(0, Math.round(Number(b.rating) || 0)));
  if (CANDIDATE_STAGES.includes(b.stage) && b.stage !== "hired") c.stage = b.stage;
  if (b.note && String(b.note).trim()) c.notes.push({ text: String(b.note).trim().slice(0, 2000), by: user.id });
  if (b.interview && dateOk(b.interview.date)) {
    c.interviews.push({ date: b.interview.date, with: (b.interview.with || []).filter(isObjectId), rating: Math.min(5, Math.max(0, Number(b.interview.rating) || 0)), note: String(b.interview.note || "").slice(0, 2000) });
    if (["applied", "screening"].includes(c.stage)) c.stage = "interview";
  }

  if (b.hire) {
    if (c.stage === "hired") return fail("already_hired", 409);
    if (!c.email || !dateOk(b.hire.startDate)) return fail("hire_needs_email_date");
    const opening = await JobOpening.findById(c.opening).lean();
    // Below the CEO, new people start as plain staff; the CEO gives other roles on the Roles page.
    const roleKey = isTopRole(user.role) && b.hire.role && (await Role.exists({ key: b.hire.role })) && !isTopRole(b.hire.role) ? b.hire.role : "staff";
    let account = await User.findOne({ email: c.email });
    if (account && account.role !== "user") return fail("hire_email_taken", 409);
    if (!account) account = new User({ email: c.email, name: c.name });
    Object.assign(account, { role: roleKey, status: "active", department: opening?.department || null, branch: opening?.branch || null, contractStart: b.hire.startDate, phone: account.phone || c.phone });
    await account.save();
    // The onboarding checklist: one task per item for whoever takes care of it, due on the start date.
    const onboarding = [];
    for (const item of (Array.isArray(b.hire.onboarding) ? b.hire.onboarding : []).slice(0, 20)) {
      const title = String(item?.title || "").trim().slice(0, 200);
      if (!title || !isObjectId(item.assignee)) continue;
      const task = await Task.create({
        number: await nextNumber("task"),
        kind: "personal",
        title: `${title} — ${c.name}`,
        assignee: item.assignee,
        createdBy: user.id,
        status: "todo",
        dueAt: new Date(`${b.hire.startDate}T09:00:00`),
        description: `${opening?.title || ""}`,
      });
      onboarding.push({ title, assignee: item.assignee, task: task._id });
      await notify({ type: "recruitment.onboarding", recipients: [String(item.assignee)], actor: user, params: { title, name: c.name, date: b.hire.startDate }, link: `/dashboard/tasks?task=${task._id}`, entityType: "task", entityId: task._id });
    }
    Object.assign(c, { stage: "hired", startDate: b.hire.startDate, hiredUser: account._id, onboarding });
    await audit(user, "recruitment.hired", { entityType: "candidate", entityId: id, summary: `${c.name} → ${roleKey}` });
  }
  await c.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE(request, { params }) {
  const user = await requirePermission("recruitment.manage");
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const c = await Candidate.findById(id);
  if (!c) return notFound();
  if (c.stage === "hired") return fail("already_hired", 409);
  await c.deleteOne();
  return NextResponse.json({ ok: true });
}
