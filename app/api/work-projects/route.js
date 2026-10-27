import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyStageRouting, cleanProjectFields, cleanStages, orderStages } from "@/lib/projectPayload";
import { flowOf, stageAfter } from "@/lib/stageFlow";
import { saveFirstBaseline } from "@/lib/projectDelay";
import { canRouteStages, dueRiskOf, listProjectsWithProgress, officeTz, projectQueryFor, serializeProject } from "@/lib/projects";
import { getWorkCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { getTaskSettings } from "@/lib/settings";
import { inScope } from "@/lib/scope";
import { logActivity, publishTaskChange } from "@/lib/tasks";
import { planProjectStages } from "@/lib/taskSchedule";
import { nextNumber } from "@/models/Counter";
import Department from "@/models/Department";
import ProjectTemplate from "@/models/ProjectTemplate";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  return NextResponse.json({ projects: await listProjectsWithProgress(projectQueryFor(user)) });
}

// Body: project fields + department + templateId (or stages/items)
// + stagePlan: [{ key, after: [keys] }] — the template's stages in the chosen order and
//   what each waits for (default: step by step)
// + tasks: { stageKey: { hours, assigneeId } } — every stage's working hours and employee.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const body = await readJson(request);

  if (!isObjectId(body.department) || !(await Department.exists({ _id: body.department }))) {
    return fail("invalid_department");
  }
  if (!hasPermission(user, "projects.manage") || !inScope(user, body.department)) return forbidden();
  // A new project's tasks get their hours and employees here: that's the GM / CEO's.
  if (!canRouteStages(user)) return fail("hours_by_ceo", 403);

  const { fields, error } = cleanProjectFields(body);
  if (error) return fail(error);
  if (!fields.name) return fail("bilingual_required");
  if (!fields.dueDate) return fail("due_required");

  const settings = await getTaskSettings();
  let stages = body.stages;
  let template = null;
  if (isObjectId(body.templateId)) {
    template = await ProjectTemplate.findById(body.templateId).lean();
    if (!template) return fail("invalid_template");
    stages = orderStages(template.stages, body.stagePlan);
    if (!stages) return fail("invalid_stage_plan");
  }
  const cleanedStages = cleanStages(stages, settings.taskTypes.map((t) => t.key));
  if (cleanedStages.error) return fail(cleanedStages.error);
  // A template's hand-overs were set by the GM, so they carry over to the project.
  const routed = await applyStageRouting(user, cleanedStages.stages, template?.stages);
  if (routed.error) return fail(routed.error);
  const stagesWithFlow = routed.stages;
  fields.flow = flowOf(stagesWithFlow);

  // Each stage becomes a task: the creator sets its hours and picks the employee.
  const plan = {};
  const input = body.tasks && typeof body.tasks === "object" ? body.tasks : {};
  for (const stage of stagesWithFlow) {
    const hours = Number(input[stage.key]?.hours);
    const assigneeId = input[stage.key]?.assigneeId;
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 200) return fail("invalid_task_hours");
    if (!isObjectId(assigneeId)) return fail("invalid_assignee");
    plan[stage.key] = { hours: Math.round(hours * 2) / 2, assigneeId };
  }
  const assigneeIds = [...new Set(Object.values(plan).map((p) => p.assigneeId))];
  if ((await User.countDocuments({ _id: { $in: assigneeIds }, status: "active", role: { $ne: "user" } })) !== assigneeIds.length) {
    return fail("invalid_assignee");
  }

  const project = await WorkProject.create({
    ...fields,
    department: body.department,
    stages: stagesWithFlow,
    baselineDueDate: fields.dueDate,
    participants: [...new Set([...(fields.participants || []), user.id])],
    createdBy: user.id,
  });
  await audit(user, "project.created", { entityType: "project", entityId: project._id, summary: fields.name.en });

  // Schedule the tasks in each employee's queue (and after the stages they wait for).
  const cal = await getWorkCalendar();
  const projectStart = fields.startDate ? new Date(fields.startDate).getTime() : Date.now();
  const stageTask = {};
  for (const slot of await planProjectStages(stagesWithFlow, plan, projectStart, cal)) {
    const i = stagesWithFlow.indexOf(slot.stage);
    const task = await Task.create({
      number: await nextNumber("task"),
      kind: "task",
      project: project._id,
      stage: slot.stage.key,
      department: slot.stage.department || body.department,
      type: slot.stage.taskType || "other",
      assignee: slot.assigneeId,
      createdBy: user.id,
      priority: fields.priority || "normal",
      plannedStart: new Date(slot.start),
      dueAt: new Date(slot.end),
      estimatedHours: slot.hours,
      maxHours: slot.hours,
      dueManual: true,
      // It can't start before the stages it waits for are done (arrows on the chart too).
      dependsOn: stageAfter(stagesWithFlow, i).map((k) => stageTask[k]).filter(Boolean),
    });
    stageTask[slot.stage.key] = task._id;
    await logActivity(task._id, user, "created");
    if (slot.assigneeId !== user.id) {
      await notify({
        type: "task.assigned",
        recipients: [slot.assigneeId],
        actor: user,
        params: { actor: user.name || user.email, number: task.number, title: [slot.stage.name?.en, fields.code || fields.name.en].filter(Boolean).join(" · ") },
        link: `/dashboard/tasks?task=${task._id}`,
        entityType: "task",
        entityId: task._id,
      });
    }
    await publishTaskChange(task);
  }

  // Baseline 1: when the project is expected to be delivered, as planned right now.
  await saveFirstBaseline(project, user);

  return NextResponse.json({ project: serializeProject(project.toObject(), { dueRisk: dueRiskOf(project, await officeTz()) }) }, { status: 201 });
}
