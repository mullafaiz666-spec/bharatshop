import { ProviderId, CustomerPaymentMode } from "@/lib/suppliers/source-registry";

export type CatalogueCandidate = {
  provider: ProviderId;
  externalProductId: string;
  variantId?: string;
  title: string;
  category: string;
  sourceUrl: string;
  sourcePriceInr: number;
  shippingInr: number;
  taxInr?: number;
  feeInr?: number;
  stock: number;
  serviceable?: boolean;
  codAvailable?: boolean;
  upiAvailable?: boolean;
  prepaidAvailable?: boolean;
  deliveryDays?: number;
  imageVerified: boolean;
  authorizedFulfilment: boolean;
  customerOrderTriggered: boolean;
  requiresPreFunding: boolean;
  checkedAt: Date;
};

export type CatalogueSelection = CatalogueCandidate & {
  landedCostInr: number;
  sellingPriceInr: number;
  profitInr: number;
  marginPct: number;
  zeroInventoryEligible: boolean;
  zeroWorkingCapitalEligible: boolean;
};

const DEFAULT_MARGIN = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35);
const MAX_AGE_MINUTES = Number(process.env.SOURCE_PRICE_MAX_AGE_MINUTES || 30);

export function isFresh(checkedAt: Date, maxAgeMinutes = MAX_AGE_MINUTES) {
  return Date.now() - checkedAt.getTime() <= maxAgeMinutes * 60_000;
}

export function landedCost(c: CatalogueCandidate) {
  return c.sourcePriceInr + c.shippingInr + (c.taxInr || 0) + (c.feeInr || 0);
}

function paymentSupported(c: CatalogueCandidate, mode?: CustomerPaymentMode) {
  if (!mode) return true;
  if (mode === "cod") return c.codAvailable === true;
  if (mode === "upi") return c.upiAvailable === true;
  return c.prepaidAvailable !== false;
}

export function qualifies(c: CatalogueCandidate, customerPincode?: string, paymentMode?: CustomerPaymentMode, marginPct = DEFAULT_MARGIN) {
  if (!c.title || !/^https?:\/\//i.test(c.sourceUrl)) return false;
  if (!Number.isFinite(c.sourcePriceInr) || c.sourcePriceInr <= 0) return false;
  if (!Number.isFinite(c.shippingInr) || c.shippingInr < 0 || c.stock <= 0) return false;
  if (!c.imageVerified || !c.authorizedFulfilment || !c.customerOrderTriggered) return false;
  if (!isFresh(c.checkedAt) || c.serviceable === false) return false;
  if (customerPincode && !c.serviceable) return false;
  if (!paymentSupported(c, paymentMode)) return false;
  return marginPct >= 0 && marginPct < 100;
}

export function priceForMargin(cost: number, marginPct = DEFAULT_MARGIN) {
  if (!Number.isFinite(cost) || cost <= 0 || marginPct < 0 || marginPct >= 100) throw new Error("Invalid cost or margin");
  return Math.ceil((cost / (1 - marginPct / 100)) / 10) * 10;
}

export function selectBestSource(candidates: CatalogueCandidate[], customerPincode?: string, paymentMode?: CustomerPaymentMode, marginPct = DEFAULT_MARGIN): CatalogueSelection | null {
  const qualified = candidates.filter(c => qualifies(c, customerPincode, paymentMode, marginPct));
  qualified.sort((a, b) => landedCost(a) - landedCost(b));
  const c = qualified[0];
  if (!c) return null;
  const cost = landedCost(c);
  const sellingPriceInr = priceForMargin(cost, marginPct);
  const profitInr = sellingPriceInr - cost;
  return {
    ...c,
    landedCostInr: cost,
    sellingPriceInr,
    profitInr,
    marginPct: sellingPriceInr ? profitInr / sellingPriceInr * 100 : 0,
    zeroInventoryEligible: c.customerOrderTriggered,
    zeroWorkingCapitalEligible: c.customerOrderTriggered && !c.requiresPreFunding,
  };
}

export function nextBestSource(candidates: CatalogueCandidate[], failedExternalProductId: string, customerPincode?: string, paymentMode?: CustomerPaymentMode, marginPct = DEFAULT_MARGIN) {
  return selectBestSource(candidates.filter(c => c.externalProductId !== failedExternalProductId), customerPincode, paymentMode, marginPct);
}
