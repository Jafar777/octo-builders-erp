import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, notFound, readJson } from "@/lib/apiUtils";
import { canConfirmChange, listChanges, setBilling } from "@/lib/clientChangeServer";
import { projectAccess } from "@/lib/projects";
import WorkProject from "@/models/WorkProject";

// The project's record of client changes after approval.
export async function GET(request, { params }) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const { id } = await params;
  const project = isObjectId(id) ? await WorkProject.findById(id, { department: 1 }).lean() : null;
  if (!project) return notFound();
  if (!projectAccess(user, project)) return forbidden();
  return NextResponse.json({ changes: await listChanges(user, project._id), canBill: canConfirmChange(user) });
}

// { changeId, billing: "free" | "paid" } — the CEO.
export async function PATCH(request, { params }) {
  const user = await requireStaff();
  if (!user || !canConfirmChange(user)) return forbidden();
  const { id } = await params;
  const b = await readJson(request);
  if (!isObjectId(id) || !isObjectId(b.changeId)) return notFound();
  const res = await setBilling(user, id, b.changeId, b.billing);
  return res.error ? fail(res.error, 409) : NextResponse.json(res);
}
