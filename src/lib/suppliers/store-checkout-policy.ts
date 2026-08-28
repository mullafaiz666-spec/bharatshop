export type StoreProvider = "cj" | "deodap" | "indiamart" | "meesho" | "other";

export type StoreOffer = {
  provider: StoreProvider;
  productUrl: string;
  title: string;
  variantRef?: string;
  storePriceInr: number;
  shippingInr: number;
  stock: number;
  checkedAt: Date;
};

/**
 * Store-rate model: supplier cost is the price actually observed at the
 * source store/cart, never a seeded catalogue/wholesale figure.
 */
export function landedStoreCost(offer: StoreOffer): number {
  if (!Number.isFinite(offer.storePriceInr) || offer.storePriceInr <= 0) throw new Error("Invalid live store price");
  if (!Number.isFinite(offer.shippingInr) || offer.shippingInr < 0) throw new Error("Invalid store shipping");
  if (!Number.isInteger(offer.stock) || offer.stock < 0) throw new Error("Invalid store stock");
  return offer.storePriceInr + offer.shippingInr;
}

export function isFresh(checkedAt: Date, maxAgeMinutes = Number(process.env.SOURCE_PRICE_MAX_AGE_MINUTES || 30)) {
  return Date.now() - checkedAt.getTime() <= maxAgeMinutes * 60_000;
}

export function canPublishOffer(offer: StoreOffer, minimumMarginPct = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35)) {
  if (offer.stock <= 0 || !isFresh(offer.checkedAt)) return false;
  const cost = landedStoreCost(offer);
  return minimumMarginPct < 100 && cost > 0;
}

export function sellingPriceFromStoreRate(offer: StoreOffer, marginPct = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35)) {
  const cost = landedStoreCost(offer);
  if (marginPct < 0 || marginPct >= 100) throw new Error("Invalid margin");
  return Math.ceil((cost / (1 - marginPct / 100)) / 10) * 10;
}

/**
 * Checkout must be implemented by a permitted browser automation adapter.
 * Adapters must stop on CAPTCHA, MFA, bot checks, payment challenges, or any
 * other restriction instead of attempting to bypass them.
 */
export interface PermittedCheckoutAdapter {
  provider: StoreProvider;
  placeOrder(input: {
    productUrl: string;
    variantRef?: string;
    quantity: number;
    customer: { name: string; phone: string; address: string; city: string; state: string; pincode: string; };
  }): Promise<{ supplierOrderId: string; trackingCode?: string; carrierName?: string }>;
}
