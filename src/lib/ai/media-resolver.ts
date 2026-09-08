import { aiModels, verifyImagesWithAI } from "@/lib/ai/provider";
import { isVerifiedMedia, minimumImageConfidence } from "@/lib/ai/media-policy";
import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";
import { searxngImageSearch, SearXNGRateLimitError } from "@/lib/searxng";

const STOP = new Set(["the","with","and","for","from","pack","piece","pieces","new","best","online","india","buy","sale","free","exact","product","official","image","images","front","back","side","angle","box","packaging","contents","colour","colors","color","variants"]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;
const MIN_CONFIDENCE = minimumImageConfidence();
const MIN_IMAGES = 4;
const MAX_IMAGES = 8;
const MAX_CANDIDATES = 12;
const SEARCH_LIMIT = 10;
const FAILURE_CACHE_MS = 10 * 60 * 1000;
const VERIFIER_PROVIDER = "local-ai";
const VERIFIER_MODEL = aiModels().vision;
const inFlight = new Map<number, Promise<any>>();
const recentFailures = new Map<number, { expiresAt: number; result: any }>();

type Candidate = { url: string; sourceUrl?: string; title?: string; textScore?: number };
type Product = { id: number; title: string; brand: string; category: string; sellingPriceInr?: unknown; mrpInr?: unknown; stockCount?: unknown; status?: string };

function tokens(s: string) {
  return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(x => x.length > 2 && !STOP.has(x));
}

function textScore(item: Candidate, product: Product) {
  const expected = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.sourceUrl || ""} ${item.url || ""}`.toLowerCase();
  const hits = expected.filter(t => hay.includes(t)).length;
  return expected.length ? hits / expected.length : 0;
}

function publicationData(product: Product) {
  const selling = Number(product.sellingPriceInr);
  const mrp = Number(product.mrpInr);
  const stock = Number(product.stockCount);
  return selling > 0 && mrp >= selling && stock > 0;
}

function cacheFailure(id: number, result: any) {
  recentFailures.set(id, { expiresAt: Date.now() + FAILURE_CACHE_MS, result });
}

async function downloadImage(url: string) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const r = await fetch(u.toString(), { signal: AbortSignal.timeout(10000), redirect: "follow", cache: "no-store", headers: { "User-Agent": "BharatShop-Image-Verifier/1.0" } });
    if (!r.ok) return null;
    const mediaType = (r.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!mediaType.startsWith("image/")) return null;
    const buf = await r.arrayBuffer();
    if (buf.byteLength < 4_000 || buf.byteLength > 5_000_000) return null;
    return { data: Buffer.from(buf).toString("base64"), mediaType, byteSize: buf.byteLength };
  } catch {
    return null;
  }
}

async function resolveOne(productId?: number, productName?: string) {
  let product: Product | undefined;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0] as Product | undefined;
  if (!product && productName) product = (await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1))[0] as Product | undefined;
  if (!product) return { status: "NOT_FOUND", reason: "Product was not found in the catalogue" };

  const cachedFailure = recentFailures.get(product.id);
  if (cachedFailure && cachedFailure.expiresAt > Date.now()) return { ...cachedFailure.result, cachedFailure: true };
  if (cachedFailure) recentFailures.delete(product.id);

  const existing = await db.select().from(productImages).where(eq(productImages.productId, product.id));
  const approved = existing
    .filter(isVerifiedMedia)
    .filter((row, index, rows) => rows.findIndex(x => x.imageUrl === row.imageUrl) === index)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (approved.length >= MIN_IMAGES) {
    const publishable = publicationData(product) && product.status === "Published";
    if (publishable && product.status !== "Published") {
      await db.update(products).set({ status: "Published", imageUrl: approved[0].imageUrl, updatedAt: new Date() }).where(eq(products.id, product.id));
    }
    return {
      status: "COMPLETE_MEDIA_RESOLVED",
      provider: "postgres-cache",
      productId: product.id,
      product: product.title,
      imageCount: Math.min(approved.length, MAX_IMAGES),
      images: approved.slice(0, MAX_IMAGES).map(x => ({ url: x.imageUrl, confidence: Number(x.verificationConfidence), reason: String((x.verificationMetadata as any)?.reason || "Previously verified") })),
      cached: true,
      publicationGate: publishable ? "PASS" : "BLOCK",
    };
  }

  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  const queries = FASHION.test(`${product.category} ${product.title}`)
    ? [`${base} product photo`, `${base} front back colour variant`]
    : [`${base} official product image`, `${base} packaging front back product images`];

  const found: Candidate[] = [];
  for (const q of queries) {
    try {
      const results = await searxngImageSearch(q, { limit: SEARCH_LIMIT, timeoutMs: 15000 });
      found.push(...results.map(r => ({ url: r.url, sourceUrl: r.sourceUrl, title: r.title })));
    } catch (e) {
      const result = {
        status: "SEARCH_ERROR",
        productId: product.id,
        product: product.title,
        error: e instanceof Error ? e.message : "SearXNG image search failed",
        retryAfterMs: e instanceof SearXNGRateLimitError ? e.retryAfterMs : undefined,
        publicationGate: "BLOCK",
        message: "Image search is rate-limited or unavailable. Product remains staged.",
      };
      cacheFailure(product.id, result);
      return result;
    }
  }

  const seen = new Set<string>();
  const candidates = found
    .filter(x => x.url && /^https:\/\//i.test(x.url) && !BAD.test(x.url))
    .filter(x => seen.has(x.url) ? false : (seen.add(x.url), true))
    .map(x => ({ ...x, textScore: textScore(x, product) }))
    .sort((a, b) => Number(b.textScore) - Number(a.textScore))
    .slice(0, MAX_CANDIDATES);

  if (!candidates.length) {
    const result = { status: "NEEDS_IMAGES", productId: product.id, product: product.title, imageCount: 0, searched: queries, publicationGate: "BLOCK", message: "No HTTPS image candidates returned by SearXNG. Product remains staged." };
    cacheFailure(product.id, result);
    return result;
  }

  const usable = (await Promise.all(candidates.map(async candidate => ({ candidate, image: await downloadImage(candidate.url) }))))
    .filter(x => x.image) as Array<{ candidate: Candidate; image: { data: string; mediaType: string; byteSize: number } }>;

  if (!usable.length) {
    const result = { status: "NEEDS_IMAGES", productId: product.id, product: product.title, imageCount: 0, searched: queries, publicationGate: "BLOCK", message: "SearXNG returned no reachable HTTPS image bytes. Product remains staged." };
    cacheFailure(product.id, result);
    return result;
  }

  const verdicts = await verifyImagesWithAI({ title: product.title, brand: product.brand }, usable.map(x => x.image));
  const accepted = verdicts
    .map(v => ({ ...v, item: usable[v.index - 1] }))
    .filter(v => v.item && v.matches && Number(v.confidence) >= MIN_CONFIDENCE && /^https:\/\//i.test(v.item.candidate.url) && !BAD.test(v.item.candidate.url))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_IMAGES);

  if (accepted.length < MIN_IMAGES) {
    const result = {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: accepted.length,
      verdicts,
      searched: queries,
      publicationGate: "BLOCK",
      provider: VERIFIER_PROVIDER,
      model: VERIFIER_MODEL,
      message: `Only ${accepted.length} image(s) passed the local vision verifier (need ${MIN_IMAGES}). Product remains staged.`,
    };
    cacheFailure(product.id, result);
    return result;
  }

  const publishable = publicationData(product) && product.status === "Published";
  const verifiedAt = new Date();
  await db.transaction(async tx => {
    // Preserve historical image evidence; consumers deduplicate verified URLs.
    await tx.insert(productImages).values(accepted.map((v, index) => ({
      productId: product.id,
      imageUrl: v.item.candidate.url,
      sourceUrl: v.item.candidate.sourceUrl || v.item.candidate.url,
      sortOrder: index,
      altText: v.item.candidate.title || `${product.title} view ${index + 1}`,
      verificationStatus: "AI_VISION_VERIFIED",
      verificationConfidence: Number(v.confidence).toFixed(3),
      verificationModel: VERIFIER_MODEL,
      verificationProvider: VERIFIER_PROVIDER,
      verificationMetadata: { reason: v.reason, matches: v.matches, sourceTitle: v.item.candidate.title || "", verifiedAt: verifiedAt.toISOString() },
      verifiedAt,
    })));
    if (publishable) {
      await tx.update(products).set({ imageUrl: accepted[0].item.candidate.url, status: "Published", updatedAt: new Date() }).where(eq(products.id, product.id));
    }
  });

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    provider: "searxng+local-ai-vision",
    model: VERIFIER_MODEL,
    productId: product.id,
    product: product.title,
    imageCount: accepted.length,
    images: accepted.map(v => ({ url: v.item.candidate.url, confidence: v.confidence, reason: v.reason })),
    cached: false,
    publicationGate: publishable ? "PASS" : "BLOCK",
    message: publishable ? `${accepted.length} images passed the local vision verifier and the product was published.` : `${accepted.length} images passed verification, but pricing/stock validation failed; product remains staged.`,
  };
}

export async function resolveVerifiedProductMedia(productId?: number, productName?: string) {
  if (!productId) return resolveOne(productId, productName);
  const existing = inFlight.get(productId);
  if (existing) return existing;
  const work = resolveOne(productId, productName).finally(() => inFlight.delete(productId));
  inFlight.set(productId, work);
  return work;
}

export async function resolveVerifiedMediaForProducts(productList: Array<{ id: number }>, maxBatch = 25) {
  const out: any[] = [];
  for (const p of productList.slice(0, maxBatch)) {
    try { out.push(await resolveVerifiedProductMedia(p.id)); }
    catch (e) { out.push({ status: "ERROR", productId: p.id, error: e instanceof Error ? e.message : "resolve failed", publicationGate: "BLOCK" }); }
  }
  return out;
}
