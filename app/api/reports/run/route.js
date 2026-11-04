import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { availableDatasets, runReport } from "@/lib/reports";

// The datasets this person may build reports from.
export async function GET() {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return forbidden();
  return NextResponse.json({ datasets: availableDatasets(user) });
}

export async function POST(request) {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return forbidden();
  const out = await runReport(user, await readJson(request));
  if (out.error) return fail(out.error, 403);
  return NextResponse.json(out);
}
