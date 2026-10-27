import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyFlow, applyStageRouting, cleanProjectFields, cleanStages } from "@/lib/projectPayload";
import { buildCells, checkStageHandoffs, dueRiskOf, officeTz, projectAccess, projectChannel, serializeProject } from "@/lib/projects";
import { projectScore } from "@/lib/projectHealth";
import { loadFinance } from "@/lib/finance";
import { publish } from "@/lib/realtime/server";
import { getTaskSettings } from "@/lib/settings";
import { getWorkCalendar } from "@/lib/ganttServer";
import { flowOf } from "@/lib/stageFlow";
import { workMsBetween } from "@/lib/gantt";
import { syncStageDependencies } from "@/lib/taskSchedule";
import { markOverrunsSoon, trackDelays } from "@/lib/projectDelay";
import { departmentChannel } from "@/lib/tasks";
import Task from "@/models/Task";
import User from "@/models/User";
import WorkProject from "@/models/WorkProject";
import { NAME_FIELDS, pickName, viewerLang } from "@/lib/personName";

// Expected start and delivery against the baselines (working time), and why they moved.
async function delivery(project) {
  const baselines = project.baselines || [];
  const cal = await getWorkCalendar();
  // Working time from a baseline's date to the current one (negative = earlier).
  const between = (a, b) => (a && b ? (b >= a ? workMsBetween(a, b, cal) : -workMsBetween(b, a, cal)) : null);
  const end = project.forecastEnd?.getTime();
  const start = project.forecastStart?.getTime();
  const diff = (b) => (b ? between(b.end.getTime(), end) : null);
  const first = baselines.find((b) => b.n === 1);
  const last = baselines.reduce((a, b) => (!a || b.n > a.n ? b : a), null);
  return {
    forecastStart: project.forecastStart || null,
    forecastEnd: project.forecastEnd || null,
    // Has work begun (the start is then the actual start)?
    started: Boolean(await Task.exists({ project: project._id, kind: { $in: ["task", "revision"] }, startedAt: { $ne: null } })),
    startVsFirstMs: first?.start ? between(first.start.getTime(), start) : null,
    vsFirstMs: diff(first),
    vsLastMs: last && last !== first ? diff(last) : null,
    delays: await delayLog(project),
  };
}

// Why the expected delivery moved, newest first, with names for the screen.
async function delayLog(project) {
  const delays = project.delays || [];
  if (!delays.length) return [];
  const lang = await viewerLang();
  const userIds = [...new Set(delays.map((d) => d.by?.toString()).filter(Boolean))];
  const projectIds = [...new Set(delays.map((d) => d.taskProject?.toString()).filter(Boolean))];
  const [users, projects] = await Promise.all([
    User.find({ _id: { $in: userIds } }, NAME_FIELDS).lean(),
    WorkProject.find({ _id: { $in: projectIds } }, { name: 1, code: 1 }).lean(),
  ]);
  const userName = Object.fromEntries(users.map((u) => [u._id.toString(), pickName(u, lang)]));
  const projectName = Object.fromEntries(projects.map((p) => [p._id.toString(), p.code || p.name?.[lang] || p.name?.en]));
  return delays
    .map((d) => ({
      id: d._id.toString(),
      at: d.at,
      from: d.from,
      to: d.to,
      workMs: d.workMs,
      field: d.field || "end",
      cause: d.cause,
      taskId: d.task?.toString() || null,
      taskNumber: d.taskNumber,
      taskProject: d.taskProject ? projectName[d.taskProject.toString()] || "" : null,
      note: d.note,
      by: d.by ? userName[d.by.toString()] || "" : null,
    }))
    .reverse();
}

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? WorkProject.findById(id) : null;
}

// Project + board cells + progress.
export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const project = await load(params);
  if (!project) return notFound();
  const access = projectAccess(user, project);
  if (!access) return forbidden();
  await markOverrunsSoon();

  const tasks = await Task.find(
    { project: project._id },
    { stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1, dueAt: 1, submittedAt: 1, estimatedHours: 1, maxHours: 1 }
  ).lean();
  const board = buildCells(project.toObject(), tasks);
  // Project KPI: delivery + quality, plus the budget part for people who may see finance
  // (the same score as the Project KPIs page).
  let cost = null;
  if (project.budget > 0 && hasPermission(user, "finance.view")) {
    const finance = await loadFinance(new Date().getFullYear());
    cost = finance.projects.find((fp) => fp.id === project._id.toString())?.cost ?? null;
  }
  const kpi = projectScore(tasks, { budget: project.budget || 0, cost });

  return NextResponse.json({ project: serializeProject(project.toObject(), { ...board, kpi, delivery: await delivery(project), dueRisk: dueRiskOf(project, await officeTz()) }), access });
}

export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const project = await load(params);
  if (!project) return notFound();
  if (projectAccess(user, project) !== "manage") return forbidden();

  const body = await readJson(request);
  const { fields, error } = cleanProjectFields(body);
  if (error) return fail(error);

  // Stages that already have tasks can't be removed.
  const used = await Task.find({ project: project._id }, { stage: 1 }).lean();
  if (Array.isArray(body.stages)) {
    const settings = await getTaskSettings();
    const cleaned = cleanStages(body.stages, settings.taskTypes.map((t) => t.key));
    if (cleaned.error) return fail(cleaned.error);
    const kept = new Set(cleaned.stages.map((s) => s.key));
    if (used.some((t) => t.stage && !kept.has(t.stage))) return fail("stage_has_tasks", 409);
    const routed = await applyStageRouting(user, cleaned.stages, project.stages);
    if (routed.error) return fail(routed.error);
    fields.stages = routed.stages;
  }
  // The stages' waits set the project type. A type sent on its own (older screens)
  // still resets the waits: ordered = step by step, random = all at once.
  if (fields.stages) fields.flow = flowOf(fields.stages);
  else if (fields.flow) fields.stages = applyFlow(project.toObject().stages, fields.flow);
  if (fields.status === "finished" && project.status !== "finished") fields.finishedAt = new Date();
  if (fields.status && fields.status !== "finished") fields.finishedAt = null;
  // Freezing the baseline keeps the original promise date for deviation reports.
  if (body.freezeBaseline) fields.baselineDueDate = fields.dueDate || project.dueDate;

  project.set(fields);
  await project.save();
  await audit(user, "project.updated", {
    entityType: "project",
    entityId: project._id,
    summary: project.name.en,
    details: { fields: Object.keys(fields) },
  });
  await publish([departmentChannel(project.department.toString()), projectChannel(project._id.toString())], "project:updated", {
    id: project._id.toString(),
  });
  if (fields.stages) {
    // The tasks follow the new order: predecessors updated, early ones pushed later.
    await syncStageDependencies(project.toObject(), await getWorkCalendar(), user);
    await checkStageHandoffs(project._id, user);
    await trackDelays({ cause: "order_changed" }, user);
  }

  return NextResponse.json({ project: serializeProject(project.toObject(), { dueRisk: dueRiskOf(project, await officeTz()) }) });
}
