import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyFlow, applyStageRouting, cleanProjectFields, cleanStages } from "@/lib/projectPayload";
import { listProjectsWithProgress, projectQueryFor, serializeProject } from "@/lib/projects";
import { getTaskSettings } from "@/lib/settings";
import { inScope } from "@/lib/scope";
import Department from "@/models/Department";
import ProjectTemplate from "@/models/ProjectTemplate";
import WorkProject from "@/models/WorkProject";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  return NextResponse.json({ projects: await listProjectsWithProgress(projectQueryFor(user)) });
}

// Body: project fields + department + templateId (or stages/items).
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const body = await readJson(request);

  if (!isObjectId(body.department) || !(await Department.exists({ _id: body.department }))) {
    return fail("invalid_department");
  }
  if (!hasPermission(user, "projects.manage") || !inScope(user, body.department)) return forbidden();

  const { fields, error } = cleanProjectFields(body);
  if (error) return fail(error);
  if (!fields.name) return fail("bilingual_required");
  if (!fields.dueDate) return fail("due_required");

  const settings = await getTaskSettings();
  // Every project gets a scale: it sets how many hours each of its tasks may take.
  if (!fields.scale || !(settings.projectScales || []).some((s) => s.key === fields.scale)) return fail("scale_required");
  if (!fields.flow) return fail("flow_required");
  let stages = body.stages;
  let template = null;
  if (isObjectId(body.templateId)) {
    template = await ProjectTemplate.findById(body.templateId).lean();
    if (!template) return fail("invalid_template");
    // Mixed projects: the creator's choice per stage ({ stageKey: true = waits }).
    const waits = body.stageWaits && typeof body.stageWaits === "object" ? body.stageWaits : null;
    stages = template.stages.map((s) => ({ ...s, waitForPrevious: waits && s.key in waits ? Boolean(waits[s.key]) : s.waitForPrevious }));
  }
  const cleanedStages = cleanStages(stages, settings.taskTypes.map((t) => t.key));
  if (cleanedStages.error) return fail(cleanedStages.error);
  // A template's hand-overs were set by the GM, so they carry over to the project.
  const routed = await applyStageRouting(user, cleanedStages.stages, template?.stages);
  if (routed.error) return fail(routed.error);

  const project = await WorkProject.create({
    ...fields,
    department: body.department,
    stages: applyFlow(routed.stages, fields.flow),
    baselineDueDate: fields.dueDate,
    participants: [...new Set([...(fields.participants || []), user.id])],
    createdBy: user.id,
  });
  await audit(user, "project.created", { entityType: "project", entityId: project._id, summary: fields.name.en });

  return NextResponse.json({ project: serializeProject(project.toObject()) }, { status: 201 });
}
