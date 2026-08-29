// ─────────────────────────────────────────────────────────────────────────────
// IMAGE RESOLVER — Chain 1: turns a product into a real, verified image
// 1. Build a clean search query from brand + title
// 2. Ask SearXNG for image results
// 3. Take the first plausible result, persist it to product_images
// 4. If SearXNG has nothing usable, fall back to a built-in Unsplash pool
//    (still recorded in product_images so the pipeline is fully auditable)
//
// NOTE: this file intentionally does NOT import from productEngine.ts —
// that module changes independently (CEO/admin features etc.) and a
// missing/renamed export there previously broke the production build.
// The fallback pool below is self-contained.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { products, productImages } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searxngImageSearch } from "@/lib/searxng";

const FALLBACK_IMAGE_POOL: Record<string, string[]> = {
  default: [
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30",
    "https://images.unsplash.com/photo-1560343090-f0409e92791a",
  ],
  fashion: [
    "https://images.unsplash.com/photo-1483985988355-763728e1935b",
    "https://images.unsplash.com/photo-1441984904996-e0b6ba687e04",
  ],
  electronics: [
    "https://images.unsplash.com/photo-1498049794561-7780e7231661",
  ],
  home: [
    "https://images.unsplash.com/photo-1583847268964-b28dc8f51f92",
  ],
};

function pickFallbackImageForCategory(category: string): string {
  const key = (category || "").toLowerCase();
  const pool =
    Object.keys(FALLBACK_IMAGE_POOL).find((k) => key.includes(k)) ?? "default";
  const images = FALLBACK_IMAGE_POOL[pool];
  return images[Math.floor(Math.random() * images.length)];
}

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
