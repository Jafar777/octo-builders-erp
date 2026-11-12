import { NextResponse } from "next/server";
import { requirePermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { getSettings, SETTINGS_VALIDATORS } from "@/lib/settings";
import { hasPartialBilingual } from "@/lib/validateBilingual";
import Setting from "@/models/Setting";

export async function GET() {
  // Every employee needs the calendar/work hours for their own screens.
  const user = await requireStaff({ limited: true });
  if (!user) return forbidden();
  return NextResponse.json({ settings: await getSettings() });
}

// Who may change each settings group (default: settings.manage). KPI has its own
// versioned route (/api/kpi/config).
const KEY_PERMISSION = { hr: "payroll.manage", finance: "finance.manage", pricing: "finance.manage", managerKpi: "kpi.manage", fileServer: "files.manage" };

// Body: { key: "calendar" | "workHours" | "currencies" | "tasks" | "hr" | "finance" | "pricing", value: {...} }
export async function PUT(request) {
  const { key, value } = await readJson(request);
  const actor = await requirePermission(KEY_PERMISSION[key] || "settings.manage");
  if (!actor) return forbidden();

  const validate = SETTINGS_VALIDATORS[key];
  if (!validate || !value || typeof value !== "object") return fail("invalid_request");
  if (hasPartialBilingual(value)) return fail("bilingual_required");

  const result = validate(value);
  if (result.error) return fail(result.error);

  const before = (await Setting.findOne({ key }).lean())?.value || null;
  await Setting.findOneAndUpdate({ key }, { key, value: result.value }, { upsert: true });
  await audit(actor, "settings.updated", { entityType: "settings", entityId: key, summary: key, details: { before, after: result.value } });

  return NextResponse.json({ ok: true, value: result.value });
}
