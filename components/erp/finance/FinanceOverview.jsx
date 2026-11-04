"use client";

import { AlertTriangle } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { Card } from "@/components/erp/ui/fields";
import { GroupedBarChart } from "@/components/erp/charts/BarChart";
import { money, monthLabel, StatTile } from "@/components/erp/hr/hrUi";

export default function FinanceOverview({ data, lookups, onOpenProject }) {
  const { t, lang } = useLanguage();
  const b = data.base;
  const m = (v) => money(v, b, lang);
  const T = data.totals;
  const costs = (x) => Math.round((x.projectExpenses + x.opex + x.salaries) * 100) / 100;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label={t("erp.finance.contracts")} value={m(T.contracts)} hint={t("erp.finance.projectsCount", { n: T.projects })} />
        <StatTile label={t("erp.finance.receivedYear")} value={m(T.received)} />
        <StatTile label={t("erp.finance.receivables")} value={m(T.receivables)} tone={T.receivables ? "text-amber-300" : ""} />
        <StatTile
          label={t("erp.finance.netProfit")}
          value={m(T.netProfit)}
          tone={T.netProfit < 0 ? "text-red-300" : "text-emerald-300"}
          hint={T.margin === null ? "" : `${T.margin}% ${t("erp.finance.ofReceived")}`}
        />
        <StatTile label={t("erp.finance.salaries")} value={m(T.salaries)} />
        <StatTile label={t("erp.finance.opex")} value={m(T.opex)} />
        <StatTile label={t("erp.finance.projectExpenses")} value={m(T.projectExpenses)} />
        <StatTile label={t("erp.finance.transferCosts")} value={m(T.transferCosts)} />
      </div>
      {data.estimatedMonths.length > 0 && (
        <p className="text-xs text-white/60">
          {t("erp.finance.estimatedNote", {
            months: data.estimatedMonths.map((x) => monthLabel(x, lang)).join("، "),
          })}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {data.funds.map((f) => (
          <Card key={f.branch}>
            <div className="flex items-baseline justify-between gap-3">
              <p className="font-semibold">{t("erp.finance.fundOf", { name: f.name?.[lang] })}</p>
              <p className={`text-2xl font-bold tabular-nums ${f.balance < 0 ? "text-red-300" : ""}`}>{m(f.balance)}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              <span className="text-white/55">{t("erp.finance.in")}</span>
              <span className="text-end tabular-nums text-emerald-300">{m(f.income + f.transfersIn)}</span>
              <span className="text-white/55">{t("erp.finance.out")}</span>
              <span className="text-end tabular-nums text-red-300">{m(f.expenses + f.salaries + f.transfersOut)}</span>
              {f.inTransit > 0 && (
                <>
                  <span className="text-white/55">{t("erp.finance.inTransit")}</span>
                  <span className="text-end tabular-nums text-amber-300">{m(f.inTransit)}</span>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>

      <Card>
        <p className="mb-3 text-sm font-medium text-white/70">{t("erp.finance.incomeVsCosts", { base: b })}</p>
        <div className="overflow-x-auto">
          <div className="min-w-[640px]">
            <GroupedBarChart
              categories={data.monthly.map((x) => ({
                key: x.month,
                label: monthLabel(x.month, lang).split(" ")[0],
              }))}
              series={[
                {
                  key: "income",
                  label: t("erp.finance.income"),
                  values: Object.fromEntries(data.monthly.map((x) => [x.month, x.income])),
                },
                {
                  key: "costs",
                  label: t("erp.finance.costs"),
                  values: Object.fromEntries(data.monthly.map((x) => [x.month, costs(x)])),
                },
              ]}
            />
          </div>
        </div>
      </Card>

      <Card>
        <p className="mb-3 text-sm font-medium text-white/70">{t("erp.finance.monthlyTable")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                {["month", "income", "salaries", "opex", "projectExpenses", "net"].map((h) => (
                  <th key={h} className="px-2 pb-2 text-start font-medium">
                    {t(`erp.finance.col.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.monthly
                .filter((x) => x.income || costs(x))
                .map((x) => (
                  <tr key={x.month} className="border-t border-white/5">
                    <td className="px-2 py-2">
                      {monthLabel(x.month, lang)}
                      {data.estimatedMonths.includes(x.month) && <span className="ms-1 text-[11px] text-amber-300">≈</span>}
                    </td>
                    <td className="px-2 py-2 tabular-nums text-emerald-300">{m(x.income)}</td>
                    <td
                      className="px-2 py-2 tabular-nums"
                      title={Object.entries(x.salaryByBranch)
                        .map(([k, v]) => `${lookups.branchName(k)}: ${v}`)
                        .join(" · ")}
                    >
                      {m(x.salaries)}
                    </td>
                    <td
                      className="px-2 py-2 tabular-nums"
                      title={Object.entries(x.opexByBranch)
                        .map(([k, v]) => `${lookups.branchName(k)}: ${v}`)
                        .join(" · ")}
                    >
                      {m(x.opex)}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{m(x.projectExpenses)}</td>
                    <td className={`px-2 py-2 font-semibold tabular-nums ${x.net < 0 ? "text-red-300" : ""}`}>{m(x.net)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <p className="mb-1 text-sm font-medium text-white/70">{t("erp.finance.profitability")}</p>
        <p className="mb-3 text-xs text-white/60">{t(`erp.finance.allocationHint_${data.allocation || "hours"}`)} {t("erp.finance.lifetimeHint")}</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="text-xs text-white/50">
              <tr>
                {["project", "total", "received", "remaining", "expenses", "hours", "overhead", "profitReceived", "profitContract"].map((h) => (
                  <th key={h} className="px-2 pb-2 text-start font-medium">
                    {t(`erp.finance.col.${h}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.projects
                .filter((p) => p.total || p.received || p.expenses || p.hours)
                .sort((a, c) => c.total - a.total)
                .map((p) => (
                  <tr key={p.id} onClick={() => onOpenProject(p.id)} className="cursor-pointer border-t border-white/5 hover:bg-white/[0.04]">
                    <td className="px-2 py-2 font-medium">
                      {p.name?.[lang]}
                      {p.code && <span className="ms-1 text-xs text-white/60">{p.code}</span>}
                      {p.overBudget && (
                        <span className="ms-2 inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-300">
                          <AlertTriangle size={11} /> {t("erp.finance.overBudgetShort")}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 tabular-nums">{m(p.total)}</td>
                    <td className="px-2 py-2 tabular-nums text-emerald-300">{m(p.received)}</td>
                    <td className={`px-2 py-2 tabular-nums ${p.remaining > 0 ? "text-amber-300" : ""}`}>{m(p.remaining)}</td>
                    <td className="px-2 py-2 tabular-nums">{m(p.expenses)}</td>
                    <td className="px-2 py-2 tabular-nums">{p.hours}</td>
                    <td className="px-2 py-2 tabular-nums">{m(p.overhead)}</td>
                    <td className={`px-2 py-2 font-semibold tabular-nums ${p.profitReceived < 0 ? "text-red-300" : "text-emerald-300"}`}>
                      {m(p.profitReceived)}
                    </td>
                    <td className={`px-2 py-2 tabular-nums ${p.profitContract < 0 ? "text-red-300" : ""}`}>{m(p.profitContract)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
