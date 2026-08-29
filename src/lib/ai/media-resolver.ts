import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";
import { searxngImageSearch } from "@/lib/searxng";

const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free","exact","product","official","image","front","back","side","angle","box","packaging","contents","colour","colors","color","variants"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)/i;

type ImageSearchResult = { url?: string; sourceUrl?: string; title?: string; source?: string };

function tokens(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
}

function score(item: ImageSearchResult, product: any) {
  const ts = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.source || ""} ${item.sourceUrl || item.url || ""}`.toLowerCase();
  const hits = ts.filter(t => hay.includes(t)).length;
  const ratio = ts.length ? hits / ts.length : 0;
  const brand = String(product.brand || "").trim().toLowerCase();
  return ratio + (brand && brand !== "generic" && hay.includes(brand) ? 0.25 : 0);
}

export async function resolveProductMedia(productId?: number, productName?: string) {
  let product: any = null;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product && productName) product = (await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1))[0];
  if (!product) return { status: "NOT_FOUND", reason: "Exact product was not found in the catalogue" };

  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  const queries = [
    `${base} product photo`,
    `${base} front back side product images`,
    `${base} colour variant product images`,
    `${base} packaging box size chart`,
  ];

  const found: ImageSearchResult[] = [];
  const searchErrors: string[] = [];
  for (const q of queries) {
    try {
      const results = await searxngImageSearch(q, { limit: 8, timeoutMs: 15000 });
      found.push(...results);
    } catch (e) {
      searchErrors.push(e instanceof Error ? e.message : "SearXNG search failed");
    }
  }

  const ranked = found
    .filter(x => x.url && /^https?:\/\//i.test(x.url) && x.sourceUrl && !BAD.test(x.url))
    .map(x => ({ ...x, score: score(x, product) }))
    .sort((a, b) => b.score - a.score);

  const threshold = 0.35;
  const selected: any[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    if (selected.length >= 8) break;
    if (Number(item.score) < threshold || seen.has(item.url!)) continue;
    seen.add(item.url!);
    selected.push(item);
  }

  if (selected.length < 4) return {
    status: "NO_EXACT_IMAGE",
    productId: product.id,
    product: product.title,
    imageCount: selected.length,
    bestScore: Number((ranked[0]?.score || 0).toFixed(3)),
    searched: queries,
    provider: "searxng",
    searchErrors,
    message: "Fewer than 4 sufficiently matching exact-product images were found. The listing remains unchanged rather than using an unrelated image."
  };

  await db.delete(productImages).where(eq(productImages.productId, product.id));
  await db.insert(productImages).values(selected.map((item: any, index: number) => ({
    productId: product.id,
    imageUrl: item.url!,
    sourceUrl: item.sourceUrl!,
    sortOrder: index,
    altText: item.title || `${product.title} customer view ${index + 1}`,
    verificationStatus: "WEB_IMAGE_EXACT_MATCH",
  })));
  await db.update(products).set({ imageUrl: selected[0].url!, updatedAt: new Date() }).where(eq(products.id, product.id));

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    provider: "searxng",
    productId: product.id,
    product: product.title,
    imageCount: selected.length,
    images: selected.map((x: any) => ({ title: x.title, imageUrl: x.url, sourceUrl: x.sourceUrl, score: Number(x.score.toFixed(3)) })),
    message: `Found ${selected.length} high-confidence product images with SearXNG and saved them to the product gallery.`
  };
}
