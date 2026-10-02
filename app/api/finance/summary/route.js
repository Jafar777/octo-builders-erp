import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { loadFinance } from "@/lib/finance";

// Yearly summary: totals, branch funds, monthly table, per-project profitability.
// ?year=2026
export async function GET(request) {
  const user = await requirePermission("finance.view");
  if (!user) return forbidden();
  const param = new URL(request.url).searchParams.get("year");
  const year = /^\d{4}$/.test(param || "") ? param : String(new Date().getFullYear());
  return NextResponse.json(await loadFinance(year));
}
