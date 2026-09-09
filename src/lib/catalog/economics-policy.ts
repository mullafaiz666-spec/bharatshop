const normalize = (value: unknown) => String(value || "").trim().toLowerCase();

export function requiredCatalogMarginPct(category: unknown, madeToOrder = false) {
  if (madeToOrder) return 18;
  const c = normalize(category);

  // High-ticket branded electronics commonly operate on tighter retail margins.
  // They still must pass live source, stock, shipping and current-market-price gates.
  if (/(mobiles?|smartphones?|tablets?)/.test(c)) return 5;
  if (/(laptops?|computers?|desktops?|pc\b|components?)/.test(c)) return 5;
  if (/(gaming|camera|photography|tv|home entertainment)/.test(c)) return 7;
  if (/(appliances?|wearables?|watches?|audio|headphones?)/.test(c)) return 8;
  if (/(automotive|tools|hardware|office|business)/.test(c)) return 12;
  if (/(fashion|footwear|bags?|jewellery|jewelry|beauty|personal care)/.test(c)) return 18;
  return 15;
}

export function minimumCatalogProfitInr(category: unknown, madeToOrder = false) {
  if (madeToOrder) return 75;
  const c = normalize(category);
  if (/(laptops?|computers?|desktops?|pc\b|components?)/.test(c)) return 300;
  if (/(mobiles?|smartphones?|tablets?)/.test(c)) return 200;
  if (/(gaming|camera|photography|tv|home entertainment|appliances?)/.test(c)) return 150;
  if (/(wearables?|watches?|audio|headphones?)/.test(c)) return 100;
  return 50;
}

export function catalogEconomicsPolicy(category: unknown, madeToOrder = false) {
  return {
    minMarginPct: requiredCatalogMarginPct(category, madeToOrder),
    minProfitInr: minimumCatalogProfitInr(category, madeToOrder),
  };
}

// Repricing must use the same profitability floors as CEO review and listing.
export function catalogReprice(input: { category: unknown; cost: number; currentPrice: number; targetPrice: number; ceiling: number }) {
  const policy = catalogEconomicsPolicy(input.category);
  const minimum = Math.ceil(Math.max(input.cost / (1 - policy.minMarginPct / 100), input.cost + policy.minProfitInr) / 10) * 10;
  const price = input.currentPrice >= minimum && input.currentPrice <= input.targetPrice
    ? input.currentPrice : Math.max(minimum, input.targetPrice);
  const viable = [input.cost, input.targetPrice, input.ceiling, price].every(Number.isFinite)
    && input.cost > 0 && input.targetPrice > 0 && price <= input.ceiling
    && price - input.cost >= policy.minProfitInr
    && (price - input.cost) / price * 100 >= policy.minMarginPct;
  return { price, viable, policy };
}
