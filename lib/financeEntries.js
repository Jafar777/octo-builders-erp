import Branch from "@/models/Branch";
import Client from "@/models/Client";
import WorkProject from "@/models/WorkProject";
import { isObjectId } from "@/lib/apiUtils";
import { cleanMoney } from "@/lib/finance";
import { ENTRY_KINDS } from "@/models/FinanceEntry";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const idStr = (v) => (v ? v.toString() : null);

export function serializeEntry(e) {
  return {
    id: e._id.toString(),
    kind: e.kind,
    project: idStr(e.project),
    client: idStr(e.client),
    branch: idStr(e.branch),
    date: e.date,
    category: e.category,
    beneficiary: e.beneficiary,
    description: e.description,
    amount: e.amount,
    currency: e.currency,
    rate: e.rate,
    baseAmount: e.baseAmount,
    createdAt: e.createdAt,
  };
}

// Validates a finance entry body. Returns { value } or { error }.
export async function cleanEntry(body, settings) {
  if (!ENTRY_KINDS.includes(body.kind)) return { error: "invalid_request" };
  if (!DATE.test(body.date || "")) return { error: "invalid_date" };

  const needsProject = ["contract", "adjustment", "payment", "project_expense"].includes(body.kind);
  const cash = ["payment", "project_expense", "operating_expense"].includes(body.kind);
  if (needsProject && !(isObjectId(body.project) && (await WorkProject.exists({ _id: body.project })))) {
    return { error: "invalid_project" };
  }
  if (cash && !(isObjectId(body.branch) && (await Branch.exists({ _id: body.branch })))) return { error: "branch_required" };
  if (body.client && !(isObjectId(body.client) && (await Client.exists({ _id: body.client })))) return { error: "invalid_client" };

  const money = cleanMoney(body, settings.currencies, { allowNegative: body.kind === "adjustment" });
  if (money.error) return money;
  const categories = settings.finance.expenseCategories.map((c) => c.key);
  const isExpense = body.kind.endsWith("_expense");

  return {
    value: {
      kind: body.kind,
      project: needsProject ? body.project : null,
      client: body.client || null,
      branch: cash ? body.branch : isObjectId(body.branch) ? body.branch : null,
      date: body.date,
      category: isExpense ? (categories.includes(body.category) ? body.category : "other") : "",
      beneficiary: String(body.beneficiary || "").slice(0, 150),
      description: String(body.description || "").slice(0, 500),
      ...money,
    },
  };
}

export const serializeClient = (c) => ({ id: c._id.toString(), name: c.name, phone: c.phone, email: c.email, notes: c.notes });
