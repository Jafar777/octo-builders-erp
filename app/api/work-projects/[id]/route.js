import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanItems, cleanProjectFields, cleanStages } from "@/lib/projectPayload";
import { buildCells, projectAccess, serializeProject } from "@/lib/projects";
import { projectScore } from "@/lib/projectHealth";
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
    { item: 1, stage: 1, revision: 1, status: 1, kind: 1, createdAt: 1, assignee: 1, number: 1, dueAt: 1, submittedAt: 1 }
  ).lean();
  const board = buildCells(project.toObject(), tasks);
  // Project KPI: delivery + quality here; the cost part is added on the finance-aware analytics page.
  const kpi = projectScore(tasks);

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

  // Board structure: rows and columns that already have tasks can't be removed.
  const used = await Task.find({ project: project._id }, { item: 1, stage: 1 }).lean();
  if (Array.isArray(body.items)) {
    const items = cleanItems(body.items);
    const kept = new Set(items.map((i) => i._id.toString()));
    if (used.some((t) => t.item && !kept.has(t.item.toString()))) return fail("item_has_tasks", 409);
    fields.items = items;
  }
  if (Array.isArray(body.stages)) {
    const settings = await getTaskSettings();
    const cleaned = cleanStages(body.stages, settings.taskTypes.map((t) => t.key));
    if (cleaned.error) return fail(cleaned.error);
    const kept = new Set(cleaned.stages.map((s) => s.key));
    if (used.some((t) => t.stage && !kept.has(t.stage))) return fail("stage_has_tasks", 409);
    fields.stages = cleaned.stages;
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
  await publish(departmentChannel(project.department.toString()), "project:updated", { id: project._id.toString() });

  return NextResponse.json({ project: serializeProject(project.toObject()) });
}
