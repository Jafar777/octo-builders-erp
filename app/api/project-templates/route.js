import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { bilingual, fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyStageRouting, cleanStages } from "@/lib/projectPayload";
import { projectAccess, serializeTemplate } from "@/lib/projects";
import { getTaskSettings } from "@/lib/settings";
import { isBilingualComplete } from "@/lib/validateBilingual";
import ProjectTemplate from "@/models/ProjectTemplate";
import WorkProject from "@/models/WorkProject";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const templates = await ProjectTemplate.find().sort({ createdAt: 1 }).lean();
  return NextResponse.json({ templates: templates.map(serializeTemplate) });
}

// { name, department, stages, items } or { name, fromProjectId } ("save as template").
export async function POST(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "projects.manage")) return forbidden();
  const body = await readJson(request);
  const name = bilingual(body.name, 100);
  if (!isBilingualComplete(name)) return fail("bilingual_required");

  let data;
  if (isObjectId(body.fromProjectId)) {
    const project = await WorkProject.findById(body.fromProjectId).lean();
    if (!project || !projectAccess(user, project)) return fail("invalid_project");
    data = { department: project.department, stages: project.stages };
  } else {
    const settings = await getTaskSettings();
    const cleaned = cleanStages(body.stages, settings.taskTypes.map((t) => t.key));
    if (cleaned.error) return fail(cleaned.error);
    const routed = await applyStageRouting(user, cleaned.stages);
    if (routed.error) return fail(routed.error);
    data = {
      department: isObjectId(body.department) ? body.department : null,
      stages: routed.stages,
    };
  }

  const template = await ProjectTemplate.create({ name, ...data });
  await audit(user, "template.created", { entityType: "template", entityId: template._id, summary: name.en });
  return NextResponse.json({ template: serializeTemplate(template.toObject()) }, { status: 201 });
}
