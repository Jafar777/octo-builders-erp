import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { forbidden, isObjectId, notFound } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { taskSpan } from "@/lib/gantt";
import { projectEnd, projectStart } from "@/lib/projectDelay";
import { canEditGantt } from "@/lib/gantt";
import Task from "@/models/Task";
import { getWorkCalendar } from "@/lib/ganttServer";
import WorkProject from "@/models/WorkProject";

// "Save baseline": remembers every task's current dates (and milestone dates) so the
// Gantt can show how far the plan has moved since, and adds the next numbered
// baseline (2, 3…) with the project's expected start and delivery as planned now.
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user || !canEditGantt(user)) return forbidden();
  const { id } = await params;
  const project = isObjectId(id) ? await WorkProject.findById(id) : null;
  if (!project) return notFound();

  const tasks = await Task.find({ project: project._id, status: { $ne: "cancelled" } }).lean();
  if (tasks.length) {
    await Task.bulkWrite(
      tasks.map((t) => {
        const span = taskSpan(t);
        return { updateOne: { filter: { _id: t._id }, update: { baselineStart: new Date(span.start), baselineEnd: new Date(span.end) } } };
      })
    );
  }
  for (const m of project.milestones) m.baselineDate = m.date;
  project.taskBaselineAt = new Date();
  // Including any external review its last work goes out for.
  const end = projectEnd(tasks, await getWorkCalendar());
  if (end) {
    const n = Math.max(0, ...project.baselines.map((b) => b.n)) + 1;
    const start = projectStart(tasks);
    project.baselines.push({ n, start: start ? new Date(start) : null, end: new Date(end), at: new Date(), by: user.id });
    project.forecastEnd ||= new Date(end);
    if (start) project.forecastStart ||= new Date(start);
  }
  await project.save();
  await audit(user, "project.baseline_saved", { entityType: "project", entityId: project._id, summary: `${tasks.length}` });

  return NextResponse.json({ ok: true, at: project.taskBaselineAt, count: tasks.length, baselines: project.baselines });
}
