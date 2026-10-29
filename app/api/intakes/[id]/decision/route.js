import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { intakeNames, isIntakePlanner, serializeIntake } from "@/lib/intake";
import { notify } from "@/lib/notify";
import ProjectIntake from "@/models/ProjectIntake";

// GM / CEO: { action: "decline", reason } — they won't take the project — or
// { action: "reopen" } to look at a declined form again. Its author is told.
export async function POST(request, { params }) {
  const user = await requireStaff();
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
  if (intake.createdBy.toString() !== user.id) {
    await notify({
      type: body.action === "decline" ? "project.intake_declined" : "project.intake_reopened",
      recipients: [intake.createdBy.toString()],
      actor: user,
      params: { number: intake.number, project: intake.project.name, reason: intake.declineReason },
      link: `/dashboard/intake?intake=${intake._id}`,
      entityType: "intake",
      entityId: intake._id,
    });
  }
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}
