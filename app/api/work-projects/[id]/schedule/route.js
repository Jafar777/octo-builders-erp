import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canRouteStages } from "@/lib/projects";
import { freeSlot, getWorkCalendar } from "@/lib/ganttServer";
import { workMsBetween } from "@/lib/gantt";
import { publish } from "@/lib/realtime/server";
import { COMPANY_TASKS_CHANNEL } from "@/lib/tasks";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

// A project on hold: { action: "unschedule" } takes its not-started tasks off the
// schedule (their people are free for other work on the Gantt; the dates are kept in
// `parked`). { action: "reschedule" } puts them back: each where it was if that time is
// still free and not past, otherwise at its person's next free time of the same length.
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user || !canRouteStages(user)) return forbidden();
  const { id } = await params;
  const project = isObjectId(id) ? await WorkProject.findById(id, { status: 1, name: 1 }).lean() : null;
  if (!project) return notFound();
  const { action } = await readJson(request);

  if (action === "unschedule") {
    if (project.status !== "on_hold") return fail("project_not_on_hold", 409);
    const tasks = await Task.find({ project: project._id, status: "todo", plannedStart: { $ne: null } }, { plannedStart: 1, dueAt: 1 }).lean();
    const now = new Date();
    for (const t of tasks) {
      await Task.updateOne({ _id: t._id }, { $set: { parked: { plannedStart: t.plannedStart, dueAt: t.dueAt, at: now }, plannedStart: null, dueAt: null } });
    }
    await audit(user, "project.unscheduled", { entityType: "project", entityId: id, summary: `${tasks.length} tasks` });
    await publish([COMPANY_TASKS_CHANNEL], "task:updated", { id: "unscheduled" }).catch(() => {});
    return NextResponse.json({ ok: true, count: tasks.length });
  }

  if (action === "reschedule") {
    if (project.status === "on_hold") return fail("project_on_hold", 409);
    const cal = await getWorkCalendar();
    const tasks = await Task.find({ project: project._id, status: "todo", "parked.at": { $ne: null } }).sort({ "parked.plannedStart": 1 }).lean();
    // One by one: each placed task holds its time before the next is placed.
    for (const t of tasks) {
      const start = new Date(t.parked.plannedStart).getTime();
      const length = Math.max(workMsBetween(start, new Date(t.parked.dueAt).getTime(), cal), 30 * 60000);
      const slot = await freeSlot(t.assignee, Math.max(Date.now(), start), length, cal, [t._id]);
      await Task.updateOne({ _id: t._id }, { $set: { plannedStart: new Date(slot.start), dueAt: new Date(slot.end), parked: { plannedStart: null, dueAt: null, at: null } } });
    }
    await audit(user, "project.rescheduled", { entityType: "project", entityId: id, summary: `${tasks.length} tasks` });
    await publish([COMPANY_TASKS_CHANNEL], "task:updated", { id: "rescheduled" }).catch(() => {});
    return NextResponse.json({ ok: true, count: tasks.length });
  }
  return fail("invalid_request");
}
