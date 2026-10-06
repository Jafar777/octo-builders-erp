import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canManageStage, checkStageHandoffs, projectChannel } from "@/lib/projects";
import { publish } from "@/lib/realtime/server";
import { departmentChannel } from "@/lib/tasks";
import WorkProject from "@/models/WorkProject";

// Manual cell state, like the Excel "تجاوز يدوي" / "إنجاز يدوي".
// Body: { itemId, stage, status: "skip" | "done" | "clear", reason }
export async function POST(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  if (!isObjectId(id)) return notFound();
  const project = await WorkProject.findById(id);
  if (!project) return notFound();

  const body = await readJson(request);
  const item = project.items.id(body.itemId);
  const stage = project.stages.find((s) => s.key === body.stage);
  if (!item || !stage || !["skip", "done", "clear"].includes(body.status)) return fail("invalid_cell");
  // The project's managers, or the managers of the department doing this stage.
  if (!canManageStage(user, project, stage)) return forbidden();
  const reason = String(body.reason || "").trim().slice(0, 500);
  if (body.status !== "clear" && !reason) return fail("reason_required");

  project.overrides = project.overrides.filter(
    (o) => !(o.item.toString() === body.itemId && o.stage === body.stage)
  );
  if (body.status !== "clear") {
    project.overrides.push({ item: item._id, stage: stage.key, status: body.status, reason, by: user.id, at: new Date() });
  }
  await project.save();

  await audit(user, "project.cell_override", {
    entityType: "project",
    entityId: project._id,
    summary: `${item.name} · ${stage.name.en} → ${body.status}`,
    details: { reason },
  });
  await publish([departmentChannel(project.department.toString()), projectChannel(project._id.toString())], "project:updated", {
    id: project._id.toString(),
  });
  await checkStageHandoffs(project._id, user);

  return NextResponse.json({ ok: true });
}
