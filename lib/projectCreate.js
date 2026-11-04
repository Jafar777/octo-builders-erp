// Creating a project (lib/intake.js explains the whole flow). Every project comes from an
// intake form; a department manager's set-up is checked here when they send it (a
// request), and again when the CEO accepts it and the project is really created.
//
// The project has no start or due date of its own: its tasks are scheduled from the
// moment it's accepted (the employees' queues, the stages' order), and the Gantt's
// expected start and delivery become its dates and Baseline 1.

import { hasPermission } from "@/lib/currentUser";
import { audit } from "@/lib/audit";
import { applyStageRouting, cleanCustomer, cleanProjectFields, cleanStages, orderStages } from "@/lib/projectPayload";
import { cleanReviewFlags } from "@/lib/reviewFlow";
import { flowOf, stageAfter } from "@/lib/stageFlow";
import { saveFirstBaseline } from "@/lib/projectDelay";
import { canRouteStages } from "@/lib/projects";
import { getWorkCalendar } from "@/lib/ganttServer";
import { notify } from "@/lib/notify";
import { getTaskSettings } from "@/lib/settings";
import { inScope } from "@/lib/scope";
import { logActivity, publishTaskChange } from "@/lib/tasks";
import { finishIntake, linkIntake } from "@/lib/intakeConvert";
import { planProjectStages } from "@/lib/taskSchedule";
import { isObjectId } from "@/lib/apiUtils";
import { nextNumber } from "@/models/Counter";
import Department from "@/models/Department";
import ProjectTemplate from "@/models/ProjectTemplate";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";

const idStr = (v) => (v ? v.toString() : null);

// What of the set-up body is kept on a request (never money, never dates).
export const PROPOSAL_FIELDS = ["name", "code", "customer", "department", "templateId", "priority", "folderLink", "stagePlan", "tasks"];
export const proposalBody = (body) => Object.fromEntries(PROPOSAL_FIELDS.filter((k) => body?.[k] !== undefined).map((k) => [k, body[k]]));

// Checks a project set-up. `proposing`: a request (a department manager may send it);
// otherwise the CEO creates the project now. Returns { error, status } or the parts.
export async function prepareProject(user, body, { proposing = false } = {}) {
  if (!isObjectId(body.department) || !(await Department.exists({ _id: body.department }))) return { error: "invalid_department" };
  if (!hasPermission(user, "projects.manage") || !inScope(user, body.department)) return { error: "forbidden", status: 403 };
  // Creating it (hours and employees for real) is the CEO's.
  if (!proposing && !canRouteStages(user)) return { error: "hours_by_ceo", status: 403 };

  // The Gantt decides the dates: none are taken from the form.
  const { startDate: _s, dueDate: _d, ...rest } = body;
  const { fields, error } = cleanProjectFields(rest);
  if (error) return { error };
  if (!fields.name) return { error: "bilingual_required" };
  const customer = await cleanCustomer(body.customer);
  if (customer.error) return { error: customer.error };
  fields.customer = customer.customer;
  if (customer.customer) fields.client = customer.name;

  const settings = await getTaskSettings();
  let stages = body.stages;
  let template = null;
  if (isObjectId(body.templateId)) {
    template = await ProjectTemplate.findById(body.templateId).lean();
    if (!template) return { error: "invalid_template" };
    stages = orderStages(template.stages, body.stagePlan);
    if (!stages) return { error: "invalid_stage_plan" };
  }
  const cleanedStages = cleanStages(stages, settings.taskTypes.map((t) => t.key));
  if (cleanedStages.error) return { error: cleanedStages.error };
  // A template's hand-overs were set by the CEO, so they carry over to the project.
  const routed = await applyStageRouting(user, cleanedStages.stages, template?.stages);
  if (routed.error) return { error: routed.error };
  const stagesWithFlow = routed.stages;
  fields.flow = flowOf(stagesWithFlow);

  // Each stage becomes a task: its hours and employee.
  const plan = {};
  const input = body.tasks && typeof body.tasks === "object" ? body.tasks : {};
  for (const stage of stagesWithFlow) {
    const hours = Number(input[stage.key]?.hours);
    const assigneeId = input[stage.key]?.assigneeId;
    if (!Number.isFinite(hours) || hours < 0.5 || hours > 200) return { error: "invalid_task_hours" };
    if (!isObjectId(assigneeId)) return { error: "invalid_assignee" };
    const review = cleanReviewFlags(input[stage.key]?.review, { hasCustomer: Boolean(customer.customer) });
    if (review.error) return { error: review.error };
    // Optional: after it's handed in, another office reviews it for this many working
    // hours; the stages after it wait (nobody's time is held).
    const external = Number(input[stage.key]?.externalHours) || 0;
    if (!Number.isFinite(external) || external < 0 || external > 2000) return { error: "invalid_hours" };
    plan[stage.key] = { hours: Math.round(hours * 2) / 2, assigneeId, review: review.value, externalHours: Math.round(external * 2) / 2 };
  }
  const assigneeIds = [...new Set(Object.values(plan).map((p) => p.assigneeId))];
  if ((await User.countDocuments({ _id: { $in: assigneeIds }, status: "active", role: { $ne: "user" } })) !== assigneeIds.length) {
    return { error: "invalid_assignee" };
  }
  return { fields, stagesWithFlow, plan };
}

// Creates the project and schedules its tasks from now. `intake` is locked already.
export async function createProject({ user, body, fields, stagesWithFlow, plan, intake, appSettings }) {
  // Plan the tasks in each employee's queue (and after the stages they wait for) first:
  // the plan gives the project its dates.
  const cal = await getWorkCalendar();
  const slots = await planProjectStages(stagesWithFlow, plan, Date.now(), cal);
  const start = slots.length ? Math.min(...slots.map((x) => x.start)) : Date.now();
  const end = slots.length ? Math.max(...slots.map((x) => x.end)) : Date.now();

  const project = await WorkProject.create({
    ...fields,
    startDate: new Date(start),
    dueDate: new Date(end),
    baselineDueDate: new Date(end),
    department: body.department,
    stages: stagesWithFlow,
    participants: [...new Set([...(fields.participants || []), user.id, idStr(intake?.proposal?.by)].filter(Boolean))],
    createdBy: user.id,
  });
  await audit(user, "project.created", { entityType: "project", entityId: project._id, summary: fields.name.en });
  if (intake) await linkIntake(intake, project);

  const stageTask = {};
  for (const slot of slots) {
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
      review: plan[slot.stage.key].review,
      externalReview: { hours: plan[slot.stage.key].externalHours || 0 },
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

  // Baseline 1: the expected start and delivery as planned right now. They are the
  // project's dates too (the Gantt decided them).
  await saveFirstBaseline(project, user);
  if (project.forecastEnd) {
    project.startDate = project.forecastStart;
    project.dueDate = project.forecastEnd;
    project.baselineDueDate = project.forecastEnd;
    await project.save();
  }
  // The intake's money becomes the project's finance entries; the intake is closed.
  if (intake) await finishIntake(intake, project, user, appSettings);
  // The department manager who asked for it learns it was accepted.
  const proposer = idStr(intake?.proposal?.by);
  if (proposer && proposer !== user.id) {
    await notify({
      type: "project.proposal_accepted",
      recipients: [proposer],
      actor: user,
      params: { actor: user.name || user.email, project: fields.name.en || fields.name.ar },
      paramsAr: { project: fields.name.ar || fields.name.en },
      link: `/dashboard/projects/${project._id}`,
      entityType: "project",
      entityId: project._id,
    });
  }
  return project;
}
