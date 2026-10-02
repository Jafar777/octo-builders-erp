import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { fail, forbidden, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { hrMonthState, todayIn } from "@/lib/hr";
import { cleanKpiConfig, DEFAULT_KPI, kpiConfigFor, METRICS } from "@/lib/kpi/config";
import { getSettings } from "@/lib/settings";
import Setting from "@/models/Setting";

export async function GET() {
  const user = await requireStaff();
  if (!user) return forbidden();
  const settings = await getSettings();
  const month = todayIn(settings.hr.timezone).slice(0, 7);
  return NextResponse.json({
    current: kpiConfigFor(settings.kpi, month),
    versions: (settings.kpi.versions || []).map((v) => v.from),
    metrics: METRICS,
    defaults: DEFAULT_KPI,
    month,
  });
}

// Saves a version that applies from `from` (YYYY-MM) onward. Closed months keep
// their frozen results, so a version can't start inside a closed month.
export async function PUT(request) {
  const user = await requireStaff();
  if (!user || !hasPermission(user, "kpi.manage")) return forbidden();

  const result = cleanKpiConfig(await readJson(request));
  if (result.error) return fail(result.error);
  if ((await hrMonthState(result.value.from)).closed) return fail("month_closed", 409);

  const settings = await getSettings();
  const versions = (settings.kpi.versions || []).filter((v) => v.from !== result.value.from);
  versions.push(result.value);
  versions.sort((a, b) => a.from.localeCompare(b.from));
  await Setting.findOneAndUpdate({ key: "kpi" }, { key: "kpi", value: { versions } }, { upsert: true });

  const total = result.value.indicators.reduce(
    (a, ind) => a + ind.items.reduce((b, i) => b + Math.max(0, ...i.bands.map((x) => x.points)), 0),
    0
  );
  await audit(user, "kpi.config_saved", { entityType: "kpi", entityId: result.value.from, summary: `from ${result.value.from}, max ${total}` });
  return NextResponse.json({ ok: true, total });
}
