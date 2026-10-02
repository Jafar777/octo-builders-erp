import { NextResponse } from "next/server";
import { hasPermission, requireStaff } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { computeMonth, hrStaff, todayIn } from "@/lib/hr";
import { canSeePerson, MONTH_OK, staffInScope } from "@/lib/hrAccess";
import { kpiConfigFor } from "@/lib/kpi/config";
import { getSettings } from "@/lib/settings";

function previousMonths(month, count) {
  const [y, m] = month.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

// ?month=YYYY-MM&userId=<id>  → that person's KPI card + 3-month trend.
// With kpi.view also the leaderboard of the people in scope and department averages.
export async function GET(request) {
  const user = await requireStaff();
  if (!user) return forbidden();
  const params = new URL(request.url).searchParams;
  const settings = await getSettings();
  const month = MONTH_OK(params.get("month")) ? params.get("month") : todayIn(settings.hr.timezone).slice(0, 7);
  const userId = params.get("userId") || user.id;
  if (!(await canSeePerson(user, userId, "kpi.view"))) return forbidden();

  const months = previousMonths(month, 3);
  const all = await hrStaff({ status: "active" });
  const computed = {};
  for (const m of months) computed[m] = await computeMonth(m, { staff: all });

  const current = computed[month];
  const row = current.rows.find((r) => r.staff.id === userId);
  const canBoard = hasPermission(user, "kpi.view");
  const visible = canBoard ? new Set((await staffInScope(user, "kpi.view")).map((s) => s.id)) : new Set([user.id]);

  return NextResponse.json({
    month,
    closed: current.state.closed,
    bonusCurrency: current.state.bonusCurrency || settings.currencies.base,
    config: kpiConfigFor(settings.kpi, month),
    person: row?.staff || null,
    kpi: row?.kpi || null,
    trend: months.map((m) => {
      const r = computed[m].rows.find((x) => x.staff.id === userId);
      return {
        month: m,
        score: r?.kpi?.score ?? null,
        indicators: (r?.kpi?.indicators || []).map((i) => ({ key: i.key, percent: i.percent ?? (i.max ? Math.round((i.points / i.max) * 100) : 0) })),
      };
    }),
    leaderboard: canBoard
      ? current.rows
          .filter((r) => r.kpi && visible.has(r.staff.id))
          .map((r) => ({ userId: r.staff.id, name: r.staff.name, avatarUrl: r.staff.avatarUrl, department: r.staff.department, score: r.kpi.score, grade: r.kpi.grade, rank: r.kpi.rank, bonus: r.kpi.bonus }))
          .sort((a, b) => a.rank - b.rank)
      : [],
    departments: canBoard ? current.departments : {},
    people: canBoard ? [...visible] : [],
  });
}
