import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { draftMilestoneInvoice } from "@/lib/books";
import { notify, usersWithPermission } from "@/lib/notify";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { projectChannel } from "@/lib/projects";
import { canEditGantt } from "@/lib/gantt";
import { publish } from "@/lib/realtime/server";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";
import { serializeMilestone } from "@/lib/ganttServer";

async function load(user, params) {
  if (!user || !canEditGantt(user)) return { error: forbidden() };
  const { id } = await params;
  const project = isObjectId(id) ? await WorkProject.findById(id) : null;
  return project ? { project } : { error: notFound() };
}

// Validated { name, date, dependsOn, doneAt } from the body; only fields that were sent.
async function fields(body, project, billing = false) {
  const out = {};
  if (body.name !== undefined) {
    out.name = String(body.name || "").trim().slice(0, 120);
    if (!out.name) return { error: "name_required" };
  }
  if (body.date !== undefined) {
    const d = new Date(body.date);
    if (!body.date || Number.isNaN(d.getTime())) return { error: "invalid_date" };
    out.date = d;
  }
  if (body.dependsOn !== undefined) {
    const ids = [...new Set((Array.isArray(body.dependsOn) ? body.dependsOn : []).map(String))].filter(isObjectId);
    if ((await Task.countDocuments({ _id: { $in: ids }, project: project._id })) !== ids.length) return { error: "invalid_dependency" };
    out.dependsOn = ids;
  }
  if (body.done !== undefined) out.doneAt = body.done ? new Date() : null;
  // Billing (invoices.manage only): a share of the contract, or a fixed amount.
  if (body.billPercent !== undefined || body.billAmount !== undefined) {
    if (!billing) return { error: "forbidden_billing" };
    out.billPercent = Math.min(100, Math.max(0, Number(body.billPercent) || 0));
    out.billAmount = Math.max(0, Number(body.billAmount) || 0);
  }
  return { value: out };
}

async function done(user, project, action, summary) {
  await project.save();
  await audit(user, action, { entityType: "project", entityId: project._id, summary });
  await publish([projectChannel(project._id.toString())], "project:updated", { id: project._id.toString() });
  return NextResponse.json({ milestones: project.milestones.map(serializeMilestone) });
}

// Body: { name, date, dependsOn?: [taskId] }
export async function POST(request, { params }) {
  const user = await requireStaff();
  const { project, error } = await load(user, params);
  if (error) return error;
  const body = await readJson(request);
  const f = await fields(
    { name: body.name ?? "", date: body.date ?? "", dependsOn: body.dependsOn ?? [], billPercent: body.billPercent, billAmount: body.billAmount },
    project,
    hasPermission(user, "invoices.manage")
  );
  if (f.error) return fail(f.error);
  project.milestones.push(f.value);
  return done(user, project, "project.milestone_added", f.value.name);
}

// Body: { milestoneId, name?, date?, dependsOn?, done? }
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  const { project, error } = await load(user, params);
  if (error) return error;
  const body = await readJson(request);
  const milestone = project.milestones.id(body.milestoneId);
  if (!milestone) return notFound();
  const f = await fields(body, project, hasPermission(user, "invoices.manage"));
  if (f.error) return fail(f.error);
  milestone.set(f.value);
  // Reached: a milestone with billing drafts its invoice, and finance is told.
  if (f.value.doneAt) {
    const invoice = await draftMilestoneInvoice(project, milestone, user.id);
    if (invoice) {
      await notify({
        type: "invoice.drafted",
        recipients: await usersWithPermission("invoices.manage"),
        actor: user,
        params: { project: project.name?.ar || project.code, milestone: milestone.name, amount: `${invoice.total} ${invoice.currency}` },
        link: "/dashboard/finance?tab=invoices",
        entityType: "invoice",
        entityId: invoice._id,
      });
    }
  }
  return done(user, project, "project.milestone_updated", milestone.name);
}

// ?milestoneId=
export async function DELETE(request, { params }) {
  const user = await requireStaff();
  const { project, error } = await load(user, params);
  if (error) return error;
  const milestone = project.milestones.id(new URL(request.url).searchParams.get("milestoneId"));
  if (!milestone) return notFound();
  const name = milestone.name;
  milestone.deleteOne();
  return done(user, project, "project.milestone_deleted", name);
}
