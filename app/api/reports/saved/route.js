import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import SavedReport from "@/models/SavedReport";

export async function GET() {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return forbidden();
  const list = await SavedReport.find({ $or: [{ owner: user.id }, { shared: true }] }).sort({ updatedAt: -1 }).lean();
  return NextResponse.json({ reports: list.map((r) => ({ id: r._id.toString(), name: r.name, shared: r.shared, mine: r.owner.toString() === user.id, config: r.config })) });
}

// { name, shared, config }
export async function POST(request) {
  const user = await requirePermission("reports.build");
  if (!user || user.limited) return forbidden();
  const b = await readJson(request);
  const name = String(b.name || "").trim().slice(0, 120);
  if (!name || !b.config?.dataset) return fail("title_required");
  const config = { dataset: String(b.config.dataset), from: b.config.from || "", to: b.config.to || "", columns: b.config.columns || [], filters: b.config.filters || {}, groupBy: b.config.groupBy || "", measure: b.config.measure || {} };
  const r = await SavedReport.create({ name, owner: user.id, shared: Boolean(b.shared), config });
  return NextResponse.json({ id: r._id.toString() }, { status: 201 });
}
