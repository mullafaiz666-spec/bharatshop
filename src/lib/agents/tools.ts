import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { marketingCampaigns, products } from "@/db/schema";
import { resolveVerifiedProductMedia, resolveVerifiedMediaForProducts } from "@/lib/ai/media-resolver";

export async function catalogQuery(limit = 20) {
  return db.select({ id: products.id, title: products.title, category: products.category, price: products.sellingPriceInr, imageUrl: products.imageUrl, status: products.status, aiScore: products.aiScore }).from(products).orderBy(desc(products.aiScore)).limit(Math.min(Math.max(limit, 1), 100));
}

export async function productUpdate(productId: number, patch: { status?: string; sellingPriceInr?: string; aiMarketingCopy?: string }) {
  const [updated] = await db.update(products).set({ ...patch, updatedAt: new Date() }).where(eq(products.id, productId)).returning({ id: products.id, title: products.title, status: products.status, sellingPriceInr: products.sellingPriceInr });
  if (!updated) throw new Error("Product not found");
  return updated;
}

/**
 * Autonomous image-enrichment tool for agents. It never invents or falls
 * back to stock/placeholder media: only vision-verified source-backed images
 * are persisted. A product that cannot reach the verification threshold is
 * returned as NEEDS_IMAGES and remains unchanged.
 */
export async function resolveProductImages(productId: number) {
  return resolveVerifiedProductMedia(productId);
}

/** Resolve verified galleries for a bounded batch of products. */
export async function resolveProductImagesBatch(productIds: number[], maxBatch = 25) {
  const ids = productIds.filter((id) => Number.isFinite(id)).slice(0, maxBatch).map((id) => ({ id }));
  return resolveVerifiedMediaForProducts(ids, maxBatch);
}

export async function campaignCreate(input: { userId: number; productId: number; productTitle: string; platform: string; campaignType: string; headline: string; bodyText: string; targetAudience: string; budgetInr?: string; }) {
  const [campaign] = await db.insert(marketingCampaigns).values({ ...input, budgetInr: input.budgetInr ?? "500.00", ctaText: "Abhi Kharido!", estimatedReachK: 10, estimatedRoas: "0", status: "DRAFT" }).returning();
  return campaign;
}
