import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanMoney } from "@/lib/finance";
import { canSeeIntakeFinance, intakeNames, serializeIntake } from "@/lib/intake";
import { cleanIntakeFinance } from "@/lib/intakeRules";
import { getSettings } from "@/lib/settings";
import Branch from "@/models/Branch";
import Client from "@/models/Client";
import ProjectIntake from "@/models/ProjectIntake";

// The money side of an intake (GM / CEO only): contract value, budget, branch, the
// advance received, payment terms. Saving it makes the intake ready to become a
// project; the amounts become finance entries then (POST /api/work-projects).
// Body: { contractValue, currency, rate, budget, branch, client, advancePaid, advanceDate, paymentTerms, notes }
export async function PUT(request, { params }) {
  const user = await requireStaff();
  if (!user || !canSeeIntakeFinance(user)) return forbidden();
  const { id } = await params;
  const intake = isObjectId(id) ? await ProjectIntake.findById(id) : null;
  if (!intake) return notFound();
  if (!["new", "ready"].includes(intake.status)) return fail("intake_locked", 409);

  const settings = await getSettings();
  const body = await readJson(request);
  const { value, error } = cleanIntakeFinance(body, (amount, currency, rate) => cleanMoney({ amount, currency, rate }, settings.currencies));
  if (error) return fail(error);
  if (value.branch && !(isObjectId(value.branch) && (await Branch.exists({ _id: value.branch })))) return fail("branch_required");
  if (value.client && !(isObjectId(value.client) && (await Client.exists({ _id: value.client })))) return fail("invalid_client");

  intake.finance = { ...value, by: user.id, at: new Date() };
  intake.status = "ready";
  await intake.save();
  // No amounts in the audit log: the log is readable by more people than the money.
  await audit(user, "project.intake_priced", { entityType: "intake", entityId: intake._id, summary: `#${intake.number}` });
  return NextResponse.json({ intake: serializeIntake(intake.toObject(), user, await intakeNames([intake])) });
}
