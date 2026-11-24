import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canProposeProject, canSeeIntake, intakeNames, isIntakePlanner, serializeIntake } from "@/lib/intake";
import { notify } from "@/lib/notify";
import { prepareProject, proposalBody } from "@/lib/projectCreate";
import { usersWithPermissionFor, usersWithRolePermission } from "@/lib/scope";
import ProjectIntake from "@/models/ProjectIntake";

// A department manager (or the CEO) sets up the intake's project: template, stages,
// hours, employees, reviews — the same body as POST /api/work-projects, without dates
// or money. It's only a request: the CEO accepts it (the project starts) or rejects it.
export async function PUT(request, { params }) {
  const user = await requireStaff();
  if (!user || !canProposeProject(user)) return forbidden();
  const { id } = await params;
  const intake = isObjectId(id) ? await ProjectIntake.findById(id) : null;
  // Not a form already set up for another department (lib/intake.js intakeScope).
  if (!intake || !canSeeIntake(user, intake)) return notFound();
  if (!["new", "ready"].includes(intake.status)) return fail("intake_locked", 409);

  const body = proposalBody(await readJson(request));
  const prepared = await prepareProject(user, body, { proposing: true });
  if (prepared.error) return fail(prepared.error, prepared.status || 400);

  const first = !intake.proposal?.at;
  intake.proposal = { body, by: user.id, at: new Date() };
  intake.markModified("proposal");
  await intake.save();
  await audit(user, "project.proposed", { entityType: "intake", entityId: intake._id, summary: `#${intake.number} ${intake.project.name}` });

  // The CEO decides: tell them (not when the CEO set it up themselves).
  if (!isIntakePlanner(user)) {
    await notify({
      type: "project.proposal_new",
      recipients: [...new Set([...(await usersWithPermissionFor("projects.manage", null)), ...(await usersWithRolePermission("projects.accept"))])],
      actor: user,
      params: { actor: user.name || user.email, number: intake.number, project: intake.project.name, again: first ? "" : "1" },
      link: `/dashboard/intake?intake=${intake._id}`,
      entityType: "intake",
      entityId: intake._id,
    });
  }
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}
