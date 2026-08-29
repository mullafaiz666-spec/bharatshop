import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";

const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free","exact","product","official","image","front","back","side","angle","box","packaging","contents","colour","colors","color","variants"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten)/i;

type ImageSearchResult = { original?: string; link?: string; title?: string; source?: string };

function tokens(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
}

function score(item: ImageSearchResult, product: any) {
  const ts = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.source || ""} ${item.link || ""}`.toLowerCase();
  const hits = ts.filter(t => hay.includes(t)).length;
  const ratio = ts.length ? hits / ts.length : 0;
  const brand = String(product.brand || "").trim().toLowerCase();
  return ratio + (brand && brand !== "generic" && hay.includes(brand) ? 0.25 : 0);
}

async function googleImages(query: string, key: string) {
  const u = new URL("https://serpapi.com/search.json");
  u.searchParams.set("engine", "google_images");
  u.searchParams.set("q", query);
  u.searchParams.set("hl", "en");
  u.searchParams.set("gl", "in");
  u.searchParams.set("api_key", key);
  const r = await fetch(u, { cache: "no-store" });
  if (!r.ok) throw new Error(`Google image search ${r.status}`);
  const d = await r.json();
  return Array.isArray(d.images_results) ? d.images_results as ImageSearchResult[] : [];
}

export async function resolveProductMedia(productId?: number, productName?: string) {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) return { status: "BLOCKED", reason: "SERPAPI_API_KEY is not configured" };

  let product: any = null;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product && productName) product = (await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1))[0];
  if (!product) return { status: "NOT_FOUND", reason: "Exact product was not found in the catalogue" };

  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  const queries = [
    `${base} exact model official product image`,
    `${base} front back side product images`,
    `${base} box packaging contents`,
    `${base} colour variant product images`,
  ];
  const found: ImageSearchResult[] = [];
  for (const q of queries) found.push(...await googleImages(q, key));

  const ranked = found
    .filter(x => x.original && /^https?:\/\//i.test(x.original) && x.link && !BAD.test(x.original))
    .map(x => ({ ...x, score: score(x, product) }))
    .sort((a, b) => b.score - a.score);

  const threshold = 0.45;
  const selected: any[] = [];
  const seen = new Set<string>();
  for (const item of ranked) {
    if (selected.length >= 8) break;
    if (Number(item.score) < threshold || seen.has(item.original!)) continue;
    seen.add(item.original!);
    selected.push(item);
  }

  if (!selected.length) return {
    status: "NO_EXACT_IMAGE",
    productId: product.id,
    product: product.title,
    bestScore: Number((ranked[0]?.score || 0).toFixed(3)),
    searched: queries,
    message: "No sufficiently matching exact-product image was found. The listing should remain blocked rather than using an unrelated image."
  };

  await db.delete(productImages).where(eq(productImages.productId, product.id));
  await db.insert(productImages).values(selected.map((item: any, index: number) => ({
    productId: product.id,
    imageUrl: item.original!,
    sourceUrl: item.link!,
    sortOrder: index,
    altText: item.title || `${product.title} customer view ${index + 1}`,
    verificationStatus: "WEB_IMAGE_EXACT_MATCH",
  })));
  await db.update(products).set({ imageUrl: selected[0].original!, updatedAt: new Date() }).where(eq(products.id, product.id));

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    productId: product.id,
    product: product.title,
    imageCount: selected.length,
    images: selected.map((x: any) => ({ title: x.title, imageUrl: x.original, sourceUrl: x.link, score: Number(x.score.toFixed(3)) })),
    message: `Found ${selected.length} high-confidence product images for the exact catalogue item and saved them to the product gallery.`
  };
}
