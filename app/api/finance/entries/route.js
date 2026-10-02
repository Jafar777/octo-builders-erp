import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { cleanEntry, serializeEntry } from "@/lib/financeEntries";
import { getSettings } from "@/lib/settings";
import FinanceEntry, { ENTRY_KINDS } from "@/models/FinanceEntry";
import WorkProject from "@/models/WorkProject";
import { notify, usersWithPermission } from "@/lib/notify";

// ?project=<id>  ?kind=a,b  ?year=2026  ?branch=<id>
export async function GET(request) {
  const user = await requirePermission("finance.view");
  if (!user) return forbidden();
  const p = new URL(request.url).searchParams;
  const query = {};
  if (isObjectId(p.get("project"))) query.project = p.get("project");
  if (isObjectId(p.get("branch"))) query.branch = p.get("branch");
  const kinds = (p.get("kind") || "").split(",").filter((k) => ENTRY_KINDS.includes(k));
  if (kinds.length) query.kind = { $in: kinds };
  if (/^\d{4}$/.test(p.get("year") || "")) query.date = { $gte: `${p.get("year")}-01-01`, $lte: `${p.get("year")}-12-31` };

  const entries = await FinanceEntry.find(query).sort({ date: -1, createdAt: -1 }).limit(2000).lean();
  return NextResponse.json({ entries: entries.map(serializeEntry) });
}

export async function POST(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const settings = await getSettings();
  const { value, error } = await cleanEntry(await readJson(request), settings);
  if (error) return fail(error);

  const entry = await FinanceEntry.create({ ...value, createdBy: user.id });
  await audit(user, "finance.entry_created", {
    entityType: "finance",
    entityId: entry._id,
    summary: `${value.kind} ${value.amount} ${value.currency} (${value.date})`,
  });
  if (value.kind === "payment") {
    const project = await WorkProject.findById(value.project, { name: 1, code: 1, manager: 1 }).lean();
    await notify({
      type: "finance.payment_received",
      recipients: [...(await usersWithPermission("finance.manage")), project?.manager?.toString()].filter(Boolean),
      actor: user,
      params: { project: project?.code || project?.name?.en || "", amount: value.amount, currency: value.currency },
      link: `/dashboard/finance?tab=projects&project=${value.project}`,
      entityType: "finance",
      entityId: entry._id,
    });
  }
  return NextResponse.json({ entry: serializeEntry(entry.toObject()) }, { status: 201 });
}
