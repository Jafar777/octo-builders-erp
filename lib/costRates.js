import SalaryHistory from "@/models/SalaryHistory";
import { rateOf } from "@/lib/finance";
import { toBase } from "@/lib/financeEngine";

// Each person's hourly labour cost in the base currency: their current monthly salary
// over the company's required monthly hours. Salaries are private: only finance viewers
// ever get these numbers (money on the Gantt and in project costs).
export async function hourlyRates(userIds, settings) {
  const hours = Number(settings.workHours?.monthlyRequiredHours) || 208;
  const rows = await SalaryHistory.find({ user: { $in: userIds } }).sort({ from: -1 }).lean();
  const out = {};
  for (const s of rows) {
    const id = String(s.user);
    if (id in out) continue;
    out[id] = toBase(s.amount, rateOf(settings.currencies, s.currency) || 1) / hours;
  }
  return out;
}
