import { NextResponse } from "next/server";
import { getCurrentUser, hasPermission } from "@/lib/currentUser";
import { forbidden } from "@/lib/apiUtils";
import { loadFinance } from "@/lib/finance";
import { getSettings } from "@/lib/settings";

// Factors + hourly cost for the pricing calculator (the calculation runs in the browser).
export async function GET() {
  const user = await getCurrentUser();
  if (!hasPermission(user, "pricing.use") && !hasPermission(user, "finance.view")) return forbidden();
  const settings = await getSettings();
  const finance = await loadFinance(String(new Date().getFullYear()));
  return NextResponse.json({
    pricing: settings.pricing,
    hourlyCost: hasPermission(user, "finance.view") ? finance.hourlyCost : { used: finance.hourlyCost.used },
    base: settings.currencies.base,
    currencies: settings.currencies,
    // Only finance people see the cost basis behind the hourly rate.
    canSeeCosts: hasPermission(user, "finance.view"),
  });
}
