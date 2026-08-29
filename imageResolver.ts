// ─────────────────────────────────────────────────────────────────────────────
// IMAGE RESOLVER — Chain 1: turns a product into a real, verified image
// 1. Build a clean search query from brand + title
// 2. Ask SearXNG for image results
// 3. Take the first plausible result, persist it to product_images
// 4. If SearXNG has nothing usable, fall back to the static Unsplash pool
//    (still recorded in product_images so the pipeline is fully auditable)
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { products, productImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searxngImageSearch } from "@/lib/searxng";
import { pickFallbackImageForCategory } from "@/lib/productEngine";

function buildQuery(title: string, brand: string): string {
  const cleanTitle = title
    .replace(/\$\{.*?\}/g, "")
    .replace(/[^\w\s&-]/g, " ")
    .split(/\s+/)
    .slice(0, 6)
    .join(" ");
  const brandPart = brand && brand !== "Generic" ? `${brand} ` : "";
  return `${brandPart}${cleanTitle} product photo`.trim();
}

export interface ResolveResult {
  productId: number;
  imageUrl: string;
  sourceEngine: "searxng" | "unsplash_fallback";
  searchQuery: string;
}

export async function resolveImageForProduct(product: {
  id: number;
  title: string;
  brand: string;
  category: string;
}): Promise<ResolveResult> {
  const query = buildQuery(product.title, product.brand);
  const results = await searxngImageSearch(query, { limit: 5 });

  let chosen: { url: string; thumbnailUrl?: string; sourceUrl?: string; width?: number; height?: number } | null = null;
  let sourceEngine: "searxng" | "unsplash_fallback" = "unsplash_fallback";

  if (results.length > 0) {
    chosen = results[0];
    sourceEngine = "searxng";
  }

  const finalUrl = chosen?.url ?? pickFallbackImageForCategory(product.category);

  await db.insert(productImages).values({
    productId: product.id,
    imageUrl: finalUrl,
    thumbnailUrl: chosen?.thumbnailUrl ?? null,
    sourceEngine,
    sourceUrl: chosen?.sourceUrl ?? null,
    searchQuery: query,
    isPrimary: true,
    width: chosen?.width ?? null,
    height: chosen?.height ?? null,
    status: "RESOLVED",
  });

  await db.update(products)
    .set({ imageUrl: finalUrl, updatedAt: new Date() })
    .where(eq(products.id, product.id));

  return { productId: product.id, imageUrl: finalUrl, sourceEngine, searchQuery: query };
}

/**
 * Resolve images for a batch of products sequentially, capped to avoid
 * hammering the SearXNG instance and blowing serverless time limits.
 */
export async function resolveImagesForProducts(
  productList: Array<{ id: number; title: string; brand: string; category: string }>,
  maxBatch = 25
): Promise<ResolveResult[]> {
  const batch = productList.slice(0, maxBatch);
  const out: ResolveResult[] = [];
  for (const p of batch) {
    try {
      out.push(await resolveImageForProduct(p));
    } catch {
      // Skip a single product failure without aborting the whole batch
    }
  }
  return out;
}
