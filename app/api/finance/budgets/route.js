import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { fail, forbidden, isObjectId, readJson } from "@/lib/apiUtils";
import { audit } from "@/lib/audit";
import { loadBooks, loadBudgets } from "@/lib/books";
import { isSalaryCategory } from "@/lib/financeEngine";
import Budget from "@/models/Budget";

const idStr = (v) => (v ? v.toString() : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// The lines a budget can have: salaries, project expenses, and each operating expense
// category that isn't a salary one.
function budgetLines(settings) {
  return ["salaries", "project_expenses", ...settings.finance.expenseCategories.filter((c) => !isSalaryCategory(c)).map((c) => c.key)];
}

// What was actually spent per line per month (base), for one branch or all (null).
function actuals(year, branch, { entries, salaries, settings }) {
  const salaryCats = settings.finance.expenseCategories.filter(isSalaryCategory).map((c) => c.key);
  const out = {};
  const add = (line, month, v) => {
    if (!month.startsWith(`${year}-`)) return;
    const i = Number(month.slice(5, 7)) - 1;
    (out[line] ||= Array(12).fill(0))[i] = r2(out[line][i] + v);
  };
  const mine = (b) => !branch || idStr(b) === branch;
  for (const e of entries) {
    if (!mine(e.branch)) continue;
    const month = e.date.slice(0, 7);
    if ((e.kind === "operating_expense" || e.kind === "project_expense") && salaryCats.includes(e.category)) add("salaries", month, e.baseAmount);
    else if (e.kind === "project_expense") add("project_expenses", month, e.baseAmount);
    else if (e.kind === "operating_expense") add(e.category, month, e.baseAmount);
  }
  for (const s of salaries) if (mine(s.branch)) add("salaries", s.month, s.base);
  return out;
}

// ?year=2026&branch=<id|empty for the whole company>
export async function GET(request) {
  const user = await requirePermission("finance.view");
  if (!user || user.limited) return forbidden();
  const p = new URL(request.url).searchParams;
  const books = await loadBooks();
  const year = /^\d{4}$/.test(p.get("year") || "") ? p.get("year") : books.today.slice(0, 4);
  const branch = isObjectId(p.get("branch")) ? p.get("branch") : null;
  const saved = (await loadBudgets(year)).filter((b) => idStr(b.branch) === branch);
  const actual = actuals(year, branch, books);
  const lines = budgetLines(books.settings).map((line) => {
    const b = saved.find((x) => x.line === line);
    return { line, budget: b?.months || Array(12).fill(0), actual: actual[line] || Array(12).fill(0) };
  });
  return NextResponse.json({ year, branch, base: books.settings.currencies.base, categories: books.settings.finance.expenseCategories, lines, currentMonth: books.today.slice(0, 7) });
}

// { year, branch|null, line, months: [12 numbers] }
export async function PUT(request) {
  const user = await requirePermission("finance.manage");
  if (!user) return forbidden();
  const body = await readJson(request);
  const books = await loadBooks();
  if (!/^\d{4}$/.test(String(body.year || ""))) return fail("invalid_request");
  if (!budgetLines(books.settings).includes(body.line)) return fail("invalid_request");
  const months = Array.from({ length: 12 }, (_, i) => r2(Math.max(0, Number(body.months?.[i]) || 0)));
  const branch = isObjectId(body.branch) ? body.branch : null;
  await Budget.findOneAndUpdate({ year: String(body.year), branch, line: body.line }, { $set: { months, updatedBy: user.id } }, { upsert: true });
  await audit(user, "finance.budget_saved", { entityType: "budget", entityId: `${body.year}:${body.line}`, summary: `${body.line} ${r2(months.reduce((a, b) => a + b, 0))}` });
  return NextResponse.json({ ok: true });
}
