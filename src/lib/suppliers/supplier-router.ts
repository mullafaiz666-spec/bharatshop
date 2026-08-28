import { db } from "@/db";
import { sql } from "drizzle-orm";

export type SupplierCandidate = {
  provider: "cj" | "indiamart" | "meesho";
  externalProductId: string;
  variantId?: string;
  sku?: string;
  title: string;
  sourceUrl?: string;
  costInr: number;
  shippingInr: number;
  stock: number;
  currency: string;
  verifiedAt: Date;
};

export function landedCost(c: SupplierCandidate) { return c.costInr + c.shippingInr; }

export function sellingPriceForMargin(cost: number, marginPct = Number(process.env.MIN_DROPSHIP_MARGIN_PCT || 35)) {
  if (!Number.isFinite(cost) || cost <= 0 || marginPct >= 100) throw new Error("Invalid supplier cost or margin");
  return Math.ceil((cost / (1 - marginPct / 100)) / 10) * 10;
}

export function selectBestSupplier(candidates: SupplierCandidate[]) {
  return candidates.filter(c => c.stock > 0 && Number.isFinite(c.costInr) && c.costInr > 0 && Number.isFinite(c.shippingInr) && c.shippingInr >= 0).sort((a,b) => landedCost(a)-landedCost(b))[0] || null;
}

export async function ensureSupplierCandidatesTable() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS supplier_candidates (
      id SERIAL PRIMARY KEY, provider TEXT NOT NULL, external_product_id TEXT NOT NULL,
      variant_id TEXT, sku TEXT, title TEXT NOT NULL, source_url TEXT,
      cost_inr NUMERIC(12,2) NOT NULL, shipping_inr NUMERIC(12,2) NOT NULL DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'INR',
      verified_at TIMESTAMP NOT NULL DEFAULT NOW(), UNIQUE(provider, external_product_id, variant_id)
    )
  `);
}

// Only providers with an explicitly configured, authorized ordering integration may auto-purchase.
export function canPlaceAutomatedOrder(provider: SupplierCandidate["provider"]) {
  if (provider === "cj") return process.env.CJ_LIVE_FULFILLMENT_ENABLED === "true";
  if (provider === "indiamart") return process.env.INDIAMART_LIVE_FULFILLMENT_ENABLED === "true";
  if (provider === "meesho") return process.env.MEESHO_LIVE_FULFILLMENT_ENABLED === "true";
  return false;
}
