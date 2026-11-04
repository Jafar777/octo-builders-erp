import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { canEditGantt } from "@/lib/gantt";
import WorkProject from "@/models/WorkProject";

// The CEO's priority order of the projects, dragged on the Gantt: { ids: [top first] }.
// Each project's rank is its place in the list (0 = the highest priority).
export async function PUT(request) {
  const user = await requireStaff();
  if (!user || !canEditGantt(user)) return forbidden();
  const { ids } = await readJson(request);
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || !ids.every(isObjectId) || new Set(ids).size !== ids.length) {
    return fail("invalid_request");
  }
  await WorkProject.bulkWrite(ids.map((id, rank) => ({ updateOne: { filter: { _id: id }, update: { $set: { rank } } } })));
  return NextResponse.json({ ok: true });
}
