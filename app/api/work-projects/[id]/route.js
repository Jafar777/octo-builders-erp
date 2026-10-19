import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyFlow, applyStageRouting, cleanProjectFields, cleanStages } from "@/lib/projectPayload";
import { buildCells, checkStageHandoffs, projectAccess, projectChannel, serializeProject } from "@/lib/projects";
import { projectScore } from "@/lib/projectHealth";
import { loadFinance } from "@/lib/finance";
import { publish } from "@/lib/realtime/server";
import { getTaskSettings } from "@/lib/settings";
import { departmentChannel } from "@/lib/tasks";
import Task from "@/models/Task";
import WorkProject from "@/models/WorkProject";

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

  const tasks = await Task.find(
    { project: project._id },
    { stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1, dueAt: 1, submittedAt: 1 }
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

  return NextResponse.json({ project: serializeProject(project.toObject(), { ...board, kpi }), access });
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

  if ("scale" in fields) {
    const { projectScales = [] } = await getTaskSettings();
    if (!projectScales.some((s) => s.key === fields.scale)) return fail("scale_required");
  }

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
  // The project type decides which stages wait (also when only the type changed).
  if (fields.stages || fields.flow) {
    fields.stages = applyFlow(fields.stages || project.toObject().stages, fields.flow || project.flow || "mixed");
  }
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
  if (fields.stages) await checkStageHandoffs(project._id, user);

  return NextResponse.json({ project: serializeProject(project.toObject()) });
}
