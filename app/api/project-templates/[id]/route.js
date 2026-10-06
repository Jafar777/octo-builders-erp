import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { bilingual, fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { applyStageRouting, cleanStages } from "@/lib/projectPayload";
import { serializeTemplate } from "@/lib/projects";
import { getTaskSettings } from "@/lib/settings";
import { isBilingualComplete } from "@/lib/validateBilingual";
import ProjectTemplate from "@/models/ProjectTemplate";

async function load(params, user) {
  if (!user || !hasPermission(user, "projects.manage")) return { error: forbidden() };
  const { id } = await params;
  const template = isObjectId(id) ? await ProjectTemplate.findById(id) : null;
  return template ? { template } : { error: notFound() };
}

export async function PATCH(request, { params }) {
  const user = await requireStaff();
  const { template, error } = await load(params, user);
  if (error) return error;

  const body = await readJson(request);
  const name = bilingual(body.name, 100);
  if (!isBilingualComplete(name)) return fail("bilingual_required");
  const settings = await getTaskSettings();
  const cleaned = cleanStages(body.stages, settings.taskTypes.map((t) => t.key));
  if (cleaned.error) return fail(cleaned.error);
  const routed = await applyStageRouting(user, cleaned.stages, template.stages);
  if (routed.error) return fail(routed.error);

  template.set({
    name,
    department: isObjectId(body.department) ? body.department : null,
    stages: routed.stages,
    items: (Array.isArray(body.items) ? body.items : []).map((i) => String(i).trim().slice(0, 120)).filter(Boolean),
    active: body.active !== false,
  });
  await template.save();
  await audit(user, "template.updated", { entityType: "template", entityId: template._id, summary: name.en });
  return NextResponse.json({ template: serializeTemplate(template.toObject()) });
}

// Templates are only copied into projects, so deleting one never affects projects.
export async function DELETE(request, { params }) {
  const user = await requireStaff();
  const { template, error } = await load(params, user);
  if (error) return error;
  await template.deleteOne();
  await audit(user, "template.deleted", { entityType: "template", entityId: template._id, summary: template.name?.en });
  return NextResponse.json({ ok: true });
}
