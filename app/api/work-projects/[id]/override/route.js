import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canManageStage, checkStageHandoffs, projectChannel } from "@/lib/projects";
import { getWorkCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { trackDelays } from "@/lib/projectDelay";
import { publish } from "@/lib/realtime/server";
import { syncStageDependencies } from "@/lib/taskSchedule";
import { canStartNow, departmentChannel, notifyReady } from "@/lib/tasks";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

// Not-started tasks of the project that can't start yet (waiting for tasks or a stage).
async function waitingIds(projectId) {
  const out = new Set();
  for (const t of await Task.find({ project: projectId, status: "todo" }).lean()) if (!(await canStartNow(t))) out.add(t._id.toString());
  return out;
}

// Manual cell state, like the Excel "تجاوز يدوي" / "إنجاز يدوي".
// Body: { stage, status: "skip" | "done" | "clear", reason }
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const project = await WorkProject.findById(id);
  if (!project) return notFound();

  const body = await readJson(request);
  const stage = project.stages.find((s) => s.key === body.stage);
  if (!stage || !["skip", "done", "clear"].includes(body.status)) return fail("invalid_cell");
  // The project's managers, or the managers of the department doing this stage.
  if (!canManageStage(user, project, stage)) return forbidden();
  const reason = String(body.reason || "").trim().slice(0, 500);
  if (body.status !== "clear" && !reason) return fail("reason_required");

  const waitingBefore = await waitingIds(project._id);
  project.overrides = project.overrides.filter((o) => o.stage !== stage.key);
  if (body.status !== "clear") {
    project.overrides.push({ stage: stage.key, status: body.status, reason, by: user.id, at: new Date() });
  }
  await project.save();

  await audit(user, "project.cell_override", {
    entityType: "project",
    entityId: project._id,
    summary: `${stage.name.en} → ${body.status}`,
    details: { reason },
  });
  await publish([departmentChannel(project.department.toString()), projectChannel(project._id.toString())], "project:updated", {
    id: project._id.toString(),
  });
  await checkStageHandoffs(project._id, user);

  // Skip / Done releases the tasks waiting for this stage (their predecessors and the
  // stage lock); clearing it makes them wait again.
  const changed = await syncStageDependencies(project.toObject(), await getWorkCalendar(), user);
  // Tell only the people whose task was waiting and now can start.
  for (const t of await Task.find({ project: project._id, status: "todo", _id: { $in: [...waitingBefore] } })) {
    if (await canStartNow(t)) await notifyReady(t, notify);
  }
  if (changed.length) await trackDelays({ cause: "rescheduled" }, user);

  return NextResponse.json({ ok: true });
}
