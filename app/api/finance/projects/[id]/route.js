import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import WorkProject from "@/models/WorkProject";

// Set a project's budget (planned cost, base currency; 0 = none).
export async function PUT(request, { params }) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const { id } = await params;
  const project = isObjectId(id) ? await WorkProject.findById(id) : null;
  if (!project) return notFound();
  const budget = Number((await readJson(request)).budget);
  if (!Number.isFinite(budget) || budget < 0 || budget > 1e11) return fail("invalid_amount");

  const before = project.budget || 0;
  project.budget = Math.round(budget * 100) / 100;
  project.budgetAlertSent = false; // check again against the new figure
  await project.save();
  await audit(user, "finance.budget_set", { entityType: "project", entityId: project._id, summary: `${project.code || project.name.en}: ${before} → ${project.budget}` });
  return NextResponse.json({ budget: project.budget });
}
