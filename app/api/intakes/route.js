import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canUseIntake, intakeNames, intakeScope, serializeIntake } from "@/lib/intake";
import { cleanIntake } from "@/lib/intakeRules";
import { notify } from "@/lib/notify";
import { usersWithPermissionFor, usersWithRolePermission } from "@/lib/scope";
import { nextNumber } from "@/models/Counter";
import ProjectIntake, { INTAKE_STATUSES } from "@/models/ProjectIntake";
import WorkProject from "@/models/WorkProject";

// New-project intake forms (lib/intake). ?status=new|ready|converted|declined
export async function GET(request) {
  const user = await requireStaff({ limited: true });
  if (!user || !canUseIntake(user)) return forbidden();
  const status = new URL(request.url).searchParams.get("status");
  // A department manager: their departments' forms and the ones still to take on (lib/intake.js).
  const scope = intakeScope(user) || {};
  const query = { ...scope, ...(INTAKE_STATUSES.includes(status) ? { status: status === "ready" ? { $in: ["ready", "converting"] } : status } : {}) };
  const list = await ProjectIntake.find(query).sort({ createdAt: -1 }).limit(500).lean();
  const counts = Object.fromEntries((await ProjectIntake.aggregate([{ $match: scope }, { $group: { _id: "$status", n: { $sum: 1 } } }])).map((c) => [c._id, c.n]));
  counts.ready = (counts.ready || 0) + (counts.converting || 0);
  delete counts.converting;
  const names = await intakeNames(list);
  return NextResponse.json({ intakes: list.map((i) => serializeIntake(i, user, names)), counts });
}

// The secretary (or the GM / CEO) hands in a filled form; the GM / CEO are told.
export async function POST(request) {
  const user = await requireStaff({ limited: true });
  if (!user || !canUseIntake(user)) return forbidden();
  const body = await readJson(request);
  const { value, error } = cleanIntake(body);
  if (error) return fail(error);
  // A form for a project that already exists (made before the forms): it is born
  // "converted", linked to that project.
  let workProject = null;
  if (body.workProjectId) {
    workProject = isObjectId(body.workProjectId) ? await WorkProject.findById(body.workProjectId, { _id: 1 }).lean() : null;
    if (!workProject) return fail("invalid_project");
    if (await ProjectIntake.exists({ workProject: workProject._id })) return fail("project_has_form", 409);
  }
  const intake = await ProjectIntake.create({
    ...value,
    number: await nextNumber("intake"),
    status: workProject ? "converted" : "new",
    workProject: workProject?._id || null,
    createdBy: user.id,
  });
  if (workProject) {
    await audit(user, "project.intake_created", { entityType: "intake", entityId: intake._id, summary: `#${intake.number} ${value.project.name}` });
    return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) }, { status: 201 });
  }
  await audit(user, "project.intake_created", { entityType: "intake", entityId: intake._id, summary: `#${intake.number} ${value.project.name}` });
  await notify({
    type: "project.intake_new",
    recipients: ([...new Set([...(await usersWithPermissionFor("projects.manage", null)), ...(await usersWithRolePermission("projects.accept"))])]).filter((id) => id !== user.id),
    actor: user,
    params: { actor: user.name || user.email, number: intake.number, project: value.project.name, client: value.client.name },
    link: `/dashboard/intake?intake=${intake._id}`,
    entityType: "intake",
    entityId: intake._id,
  });
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) }, { status: 201 });
}
