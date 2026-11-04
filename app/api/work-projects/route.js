import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { dueRiskOf, listProjectsWithProgress, officeTz, projectQueryFor, serializeProject } from "@/lib/projects";
import { canSeeIntakeFinance, isIntakePlanner } from "@/lib/intake";
import { checkMoney, convertible, lockIntake, projectFieldsFrom, releaseIntake } from "@/lib/intakeConvert";
import { createProject, prepareProject } from "@/lib/projectCreate";
import { viewerLang } from "@/lib/personName";
import { getSettings } from "@/lib/settings";
import ProjectIntake from "@/models/ProjectIntake";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  return NextResponse.json({ projects: await listProjectsWithProgress(projectQueryFor(user)) });
}

// Creating a project: the CEO accepts an intake form's project (lib/intake.js). No
// project is made without an intake. Body: the set-up (see lib/projectCreate.js) +
// intakeId — a priced intake form: its details fill the project's notes, its money
// becomes the project's finance entries and budget. The tasks are scheduled from now.
export async function POST(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const body = await readJson(request);

  if (!isIntakePlanner(user)) return fail("hours_by_ceo", 403);
  if (!body.intakeId) return fail("intake_required");
  const prepared = await prepareProject(user, body);
  if (prepared.error) return fail(prepared.error, prepared.status || 400);
  const { fields, stagesWithFlow, plan } = prepared;

  // Everything is checked before the intake is locked, and it's locked before the
  // project is created, so it becomes exactly one project.
  if (!canSeeIntakeFinance(user) || !isObjectId(body.intakeId)) return fail("intake_not_ready", 409);
  const appSettings = await getSettings();
  const pending = await ProjectIntake.findOne({ _id: body.intakeId, ...convertible() });
  if (!pending) return fail("intake_not_ready", 409);
  const moneyError = await checkMoney(pending, appSettings);
  if (moneyError) return fail(moneyError);
  const intake = await lockIntake(body.intakeId);
  if (!intake) return fail("intake_not_ready", 409);
  const from = projectFieldsFrom(intake, await viewerLang());
  if (!fields.notes) fields.notes = from.notes;
  if (!fields.client) fields.client = from.client;
  fields.budget = intake.finance.budget || 0;
  fields.intake = intake._id;

  try {
    const project = await createProject({ user, body, fields, stagesWithFlow, plan, intake, appSettings });
    return NextResponse.json({ project: serializeProject(project.toObject(), { dueRisk: dueRiskOf(project, await officeTz()) }) }, { status: 201 });
  } catch (err) {
    // Back to "ready" if no project was made from it; closed if one was.
    await releaseIntake(intake);
    throw err;
  }
}
