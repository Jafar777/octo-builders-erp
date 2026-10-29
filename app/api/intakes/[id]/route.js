import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { canEditIntake, canUseIntake, intakeNames, isIntakePlanner, serializeIntake } from "@/lib/intake";
import { cleanIntake } from "@/lib/intakeRules";
import ProjectIntake from "@/models/ProjectIntake";

async function load(params) {
  const { id } = await params;
  return isObjectId(id) ? ProjectIntake.findById(id) : null;
}

export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user || !canUseIntake(user)) return forbidden();
  const intake = await load(params);
  if (!intake) return notFound();
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}

// The details (never money): the secretary until the GM / CEO price it, then the GM / CEO.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user || !canUseIntake(user)) return forbidden();
  const intake = await load(params);
  if (!intake) return notFound();
  if (!canEditIntake(user, intake)) return fail("intake_locked", 409);
  const { value, error } = cleanIntake(await readJson(request));
  if (error) return fail(error);
  intake.set(value);
  await intake.save();
  await audit(user, "project.intake_updated", { entityType: "intake", entityId: intake._id, summary: `#${intake.number}` });
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}

// A form handed in by mistake: its author (or the GM / CEO) can delete it while it's new.
export async function DELETE(request, { params }) {
  const user = await requireStaff();
  if (!user || !canUseIntake(user)) return forbidden();
  const intake = await load(params);
  if (!intake) return notFound();
  if (intake.status !== "new") return fail("intake_locked", 409);
  if (!isIntakePlanner(user) && intake.createdBy.toString() !== user.id) return forbidden();
  await ProjectIntake.deleteOne({ _id: intake._id, status: "new" });
  await audit(user, "project.intake_deleted", { entityType: "intake", entityId: intake._id, summary: `#${intake.number}` });
  return NextResponse.json({ ok: true });
}
