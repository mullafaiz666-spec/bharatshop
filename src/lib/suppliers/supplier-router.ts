import { db } from "@/db";
import { sql } from "drizzle-orm";
import { CustomerPaymentMode, ProviderId } from "./source-registry";

export type SupplierCandidate = {
  provider: ProviderId; externalProductId: string; variantId?: string; sku?: string; title: string; sourceUrl?: string;
  costInr: number; shippingInr: number; taxInr?: number; feeInr?: number; stock: number; currency: string; verifiedAt: Date;
  serviceable?: boolean; codAvailable?: boolean; upiAvailable?: boolean; prepaidAvailable?: boolean; paymentCheckedAt?: Date;
  deliveryDays?: number; returnRisk?: number; sellerRating?: number; imageVerified?: boolean; authorizedFulfilment?: boolean;
  customerOrderTriggered?: boolean; requiresPreFunding?: boolean;
};

export function landedCost(c: SupplierCandidate) { return c.costInr + c.shippingInr + (c.taxInr || 0) + (c.feeInr || 0); }

export function sellingPriceForMargin(cost: number, marginPct = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35)) {
  if (!Number.isFinite(cost) || cost <= 0 || marginPct >= 100) throw new Error("Invalid supplier cost or margin");
  return Math.ceil((cost / (1 - marginPct / 100)) / 10) * 10;
}

function paymentMatches(c: SupplierCandidate, mode?: CustomerPaymentMode) {
  if (!mode || mode === "prepaid") return c.prepaidAvailable !== false;
  if (mode === "cod") return c.codAvailable === true;
  return c.upiAvailable === true;
}

export function selectBestSource(candidates: SupplierCandidate[], opts: { pincode?: string; paymentMode?: CustomerPaymentMode } = {}) {
  return candidates
    .filter(c => c.stock > 0 && c.serviceable !== false && c.imageVerified !== false)
    .filter(c => Number.isFinite(c.costInr) && c.costInr > 0 && Number.isFinite(c.shippingInr) && c.shippingInr >= 0)
    .filter(c => paymentMatches(c, opts.paymentMode))
    .filter(c => c.authorizedFulfilment === true)
    .sort((a,b) => landedCost(a) - landedCost(b) || (a.returnRisk || 0) - (b.returnRisk || 0))[0] || null;
}

export const selectBestSupplier = selectBestSource;
export function zeroWorkingCapitalEligible(c: SupplierCandidate) {
  return c.customerOrderTriggered === true && c.requiresPreFunding === false && c.authorizedFulfilment === true;
}

export function canPlaceAutomatedOrder(provider: ProviderId) {
  const key = provider.toUpperCase().replace(/[^A-Z0-9]+/g, "_");
  return process.env[`${key}_LIVE_FULFILLMENT_ENABLED`] === "true";
}

export async function ensureSupplierCandidatesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS supplier_candidates (
      id SERIAL PRIMARY KEY, provider TEXT NOT NULL, external_product_id TEXT NOT NULL, variant_id TEXT, sku TEXT, title TEXT NOT NULL, source_url TEXT,
      cost_inr NUMERIC(12,2) NOT NULL, shipping_inr NUMERIC(12,2) NOT NULL DEFAULT 0, tax_inr NUMERIC(12,2) NOT NULL DEFAULT 0, fee_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR', serviceable BOOLEAN, cod_available BOOLEAN, upi_available BOOLEAN, prepaid_available BOOLEAN,
      payment_checked_at TIMESTAMP, delivery_days INTEGER, return_risk NUMERIC(5,2), seller_rating NUMERIC(4,2), image_verified BOOLEAN,
      authorized_fulfilment BOOLEAN, customer_order_triggered BOOLEAN, requires_pre_funding BOOLEAN, verified_at TIMESTAMP NOT NULL DEFAULT NOW(),
      UNIQUE(provider, external_product_id, variant_id)
    )
  `);
}
