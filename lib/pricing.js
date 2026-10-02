// Pricing calculator (the Excel "Pricing Calculator" + Setup_Data). Pure function,
// used live in the browser.
//
//   hours        = Σ (design + technical + admin hours of each service × quantity)
//   raw cost     = hours × hourly cost
//   multiplier   = market factor × complexity factor × client-type factor
//   real cost    = raw cost × multiplier
//   price        = real cost × (1 + size margin %)
//   profit       = price − real cost

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function quote({ lines, sizeKey, marketKey, complexityKey, clientKey, hourlyCost, pricing }) {
  const find = (list, key) => list.find((x) => x.key === key);
  const hours = { design: 0, tech: 0, admin: 0 };
  for (const line of lines) {
    const s = find(pricing.services, line.service);
    const q = Math.max(0, Number(line.quantity) || 0);
    if (!s || !q) continue;
    hours.design += s.designHours * q;
    hours.tech += s.techHours * q;
    hours.admin += s.adminHours * q;
  }
  const totalHours = hours.design + hours.tech + hours.admin;
  const size = find(pricing.sizes, sizeKey);
  const factors = {
    market: find(pricing.markets, marketKey)?.factor ?? 1,
    complexity: find(pricing.complexity, complexityKey)?.factor ?? 1,
    client: find(pricing.clientTypes, clientKey)?.factor ?? 1,
  };
  const multiplier = factors.market * factors.complexity * factors.client;
  const rawCost = totalHours * (hourlyCost || 0);
  const realCost = rawCost * multiplier;
  const margin = size?.margin ?? 0;
  const price = realCost * (1 + margin / 100);

  return {
    hours: { design: r2(hours.design), tech: r2(hours.tech), admin: r2(hours.admin), total: r2(totalHours) },
    hourlyCost: r2(hourlyCost || 0),
    rawCost: r2(rawCost),
    factors,
    multiplier: Math.round(multiplier * 10000) / 10000,
    realCost: r2(realCost),
    margin,
    price: r2(price),
    profit: r2(price - realCost),
  };
}
