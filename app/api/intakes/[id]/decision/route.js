import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { intakeNames, isIntakePlanner, serializeIntake } from "@/lib/intake";
import { notify } from "@/lib/notify";
import ProjectIntake from "@/models/ProjectIntake";

// The CEO alone: { action: "decline", reason } — the project is rejected — or
// { action: "reopen" } to look at a declined form again. Its author is told.
export async function POST(request, { params }) {
  const user = await requireStaff({ limited: true });
  if (!user || !isIntakePlanner(user)) return forbidden();
  const { id } = await params;
  const intake = isObjectId(id) ? await ProjectIntake.findById(id) : null;
  if (!intake) return notFound();
  const body = await readJson(request);

  if (body.action === "decline") {
    if (!["new", "ready"].includes(intake.status)) return fail("intake_locked", 409);
    const reason = String(body.reason || "").trim().slice(0, 1000);
    if (!reason) return fail("reason_required");
    intake.status = "declined";
    intake.declineReason = reason;
    intake.declinedBy = user.id;
  } else if (body.action === "reopen") {
    if (intake.status !== "declined") return fail("intake_locked", 409);
    intake.status = intake.finance?.at ? "ready" : "new";
    intake.declineReason = "";
    intake.declinedBy = null;
  } else {
    return fail("invalid_request");
  }
  await intake.save();
  await audit(user, `project.intake_${body.action === "decline" ? "declined" : "reopened"}`, { entityType: "intake", entityId: intake._id, summary: `#${intake.number}` });
  // The form's author and the department manager who asked for the project.
  const told = [intake.createdBy.toString(), intake.proposal?.by?.toString()].filter((x, i, a) => x && x !== user.id && a.indexOf(x) === i);
  if (told.length) {
    await notify({
      type: body.action === "decline" ? "project.intake_declined" : "project.intake_reopened",
      recipients: told,
      actor: user,
      params: { number: intake.number, project: intake.project.name, reason: intake.declineReason },
      link: `/dashboard/intake?intake=${intake._id}`,
      entityType: "intake",
      entityId: intake._id,
    });
  }
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}
