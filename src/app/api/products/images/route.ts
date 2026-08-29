import { NextResponse } from "next/server";
import { db } from "@/db";
import { products, productImages, aiActivityLogs } from "@/db/schema";
import { eq, sql, notInArray } from "drizzle-orm";
import { ensureDemoDataSeeded } from "@/lib/seed";
import { resolveImagesForProducts } from "@/lib/imageResolver";
import { isSearxngConfigured } from "@/lib/searxng";

export const maxDuration = 60;

// GET — image pipeline status: how many products have a SearXNG-resolved
// image ("VERIFIED") vs a static fallback ("FALLBACK") vs nothing yet.
export async function GET() {
  await ensureDemoDataSeeded();

  const [totalProducts] = await db.select({ count: sql<number>`count(*)::int` }).from(products);
  const [totalImages] = await db.select({ count: sql<number>`count(*)::int` }).from(productImages);
  const [searxngCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.verificationStatus, "VERIFIED"));
  const [fallbackCount] = await db.select({ count: sql<number>`count(*)::int` })
    .from(productImages)
    .where(eq(productImages.verificationStatus, "FALLBACK"));

  const resolvedProductIds = await db.selectDistinct({ productId: productImages.productId }).from(productImages);

  return NextResponse.json({
    searxngConfigured: isSearxngConfigured(),
    totalProducts: totalProducts?.count ?? 0,
    productsWithResolvedImage: resolvedProductIds.length,
    productsMissingImage: (totalProducts?.count ?? 0) - resolvedProductIds.length,
    totalImageRecords: totalImages?.count ?? 0,
    searxngResolvedCount: searxngCount?.count ?? 0,
    fallbackResolvedCount: fallbackCount?.count ?? 0,
  });
}

// POST — trigger resolution for a specific product, or a batch of unresolved
// products (up to `limit`). Body: { productId?: number, all?: boolean, limit?: number }
export async function POST(req: Request) {
  try {
    const demoUser = await ensureDemoDataSeeded();
    const userId = demoUser?.id ?? 1;
    const body = await req.json().catch(() => ({}));
    const { productId, all, limit = 25 } = body as { productId?: number; all?: boolean; limit?: number };

    let targets: Array<{ id: number; title: string; brand: string; category: string }> = [];

    if (productId) {
      const rows = await db.select({
        id: products.id, title: products.title, brand: products.brand, category: products.category,
      }).from(products).where(eq(products.id, productId));
      targets = rows;
    } else if (all) {
      const resolvedIdsRows = await db.selectDistinct({ productId: productImages.productId }).from(productImages);
      const resolvedIds = resolvedIdsRows.map(r => r.productId);
      const rows = await db.select({
        id: products.id, title: products.title, brand: products.brand, category: products.category,
      }).from(products)
        .where(resolvedIds.length > 0 ? notInArray(products.id, resolvedIds) : sql`true`)
        .limit(Math.min(limit, 100));
      targets = rows;
    } else {
      return NextResponse.json({ error: "Provide productId or all: true" }, { status: 400 });
    }

    if (targets.length === 0) {
      return NextResponse.json({ resolved: 0, message: "Nothing to resolve." });
    }

    const results = await resolveImagesForProducts(targets, Math.min(limit, 100));
    const searxngHits = results.filter(r => r.sourceEngine === "searxng").length;

    await db.insert(aiActivityLogs).values({
      userId,
      agentName: "ImagePipeline // SearXNG Resolver",
      actionType: "IMAGES_RESOLVED",
      message: `Resolved ${results.length} product image(s) — ${searxngHits} via SearXNG live search, ${results.length - searxngHits} via fallback pool.`,
      profitImpactInr: "0.00",
      status: "SUCCESS",
    });

    return NextResponse.json({
      resolved: results.length,
      searxngHits,
      fallbackHits: results.length - searxngHits,
      results,
    });
  } catch (err: unknown) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Image resolution error" }, { status: 500 });
  }
}
