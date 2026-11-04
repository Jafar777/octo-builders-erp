import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { loadBooks, loadBudgets, plannedBillings } from "@/lib/books";
import { isSalaryCategory } from "@/lib/financeEngine";
import { monthRange } from "@/lib/finance";
import { balanceSheet, cashForecast } from "@/lib/ledgerEngine";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Cash in the coming months, built from the Gantt: unpaid invoices by due date, and
// milestone billings expected when the Gantt says the milestone will be reached (plus
// the payment terms). Outflows: this month's salaries, and each month's budget for
// expenses (or the last three months' average where there's no budget).
// ?months=6&terms=14
export async function GET(request) {
  const user = await requirePermission("finance.view");
  if (!user || user.limited) return forbidden();
  const p = new URL(request.url).searchParams;
  const count = Math.min(12, Math.max(3, Number(p.get("months")) || 6));
  const terms = Math.min(120, Math.max(0, Number(p.get("terms")) || 14));
  const books = await loadBooks();
  const { journal, salaries, entries, settings, today, invoices } = books;
  const thisMonth = today.slice(0, 7);
  const [y, m] = thisMonth.split("-").map(Number);
  const endDate = new Date(Date.UTC(y, m - 1 + count - 1, 1));
  const months = monthRange(thisMonth, `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, "0")}`);

  const cash = balanceSheet(journal.lines, { to: today }).assets.find((a) => a.account === "cash")?.amount || 0;
  const openInvoices = invoices
    .filter((i) => i.status === "issued" && journal.invoices[String(i._id)]?.outstandingBase > 0)
    .map((i) => ({ number: i.number, dueDate: i.dueDate, outstandingBase: journal.invoices[String(i._id)].outstandingBase }));
  const planned = await plannedBillings(settings, terms);

  // Salaries: this month's (estimated from current salaries when not closed).
  const monthlySalaries = r2(salaries.filter((s) => s.month === thisMonth).reduce((a, s) => a + s.base, 0));
  // Expenses: budget, else the average of the last three months.
  const salaryCats = settings.finance.expenseCategories.filter(isSalaryCategory).map((c) => c.key);
  const last3 = [1, 2, 3].map((k) => {
    const d = new Date(Date.UTC(y, m - 1 - k, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  const spent = entries.filter((e) => ["operating_expense", "project_expense"].includes(e.kind) && !salaryCats.includes(e.category) && last3.includes(e.date.slice(0, 7)));
  const average = r2(spent.reduce((a, e) => a + e.baseAmount, 0) / Math.max(1, last3.length));
  const budgets = await loadBudgets(String(y));
  const nextYearBudgets = await loadBudgets(String(y + 1));
  const budgetFor = (month) => {
    const list = (month.startsWith(String(y)) ? budgets : nextYearBudgets).filter((b) => !b.branch && b.line !== "salaries");
    if (!list.length) return null;
    return r2(list.reduce((a, b) => a + (b.months[Number(month.slice(5, 7)) - 1] || 0), 0));
  };
  const outflows = Object.fromEntries(months.map((mm) => [mm, { salaries: monthlySalaries, expenses: budgetFor(mm) ?? average }]));

  return NextResponse.json({
    base: settings.currencies.base,
    today,
    startCash: cash,
    rows: cashForecast({ startCash: cash, months, openInvoices, planned, outflows }),
    openInvoices,
    planned,
    assumptions: { monthlySalaries, averageExpenses: average, terms, budgeted: months.filter((mm) => budgetFor(mm) !== null) },
  });
}
