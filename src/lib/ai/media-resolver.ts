// ─────────────────────────────────────────────────────────────────────────────
// MEDIA RESOLVER — single source of truth for product image resolution.
// Pipeline: PostgreSQL cache -> SearXNG candidate search -> cheap text
// pre-filter -> one Claude vision verification call -> only verified images
// are saved. Never falls back to a random/generic stock photo.
// ─────────────────────────────────────────────────────────────────────────────

import { db } from "@/db";
import { productImages, products } from "@/db/schema";
import { asc, eq, ilike } from "drizzle-orm";
import { searxngImageSearch } from "@/lib/searxng";

const STOP = new Set([
  "the","with","and","for","from","pack","piece","pieces","new","best","online",
  "india","buy","sale","free","exact","product","official","image","images",
  "front","back","side","angle","box","packaging","contents","colour","colors",
  "color","variants",
]);
const BAD = /(unsplash|placeholder|placehold|picsum|loremflickr|placekitten|dummyimage|via\.placeholder)/i;
const FASHION = /(fashion|women|woman|men|man|saree|sari|kurti|kurta|dress|shirt|tshirt|t-shirt|jeans|trouser|petticoat|shapewear|lehenga|salwar|apparel|clothing|footwear|shoe|sandal|jewellery|jewelry)/i;

const ANTHROPIC_MODEL = process.env.ANTHROPIC_VISION_MODEL || "claude-sonnet-5";
const MIN_CONFIDENCE = Number(process.env.IMAGE_VERIFY_MIN_CONFIDENCE || 0.75);
const MIN_IMAGES = 4;
const MAX_IMAGES = 8;
const MAX_VISION_CANDIDATES = 8;
const SEARCH_LIMIT = 6;

// Prevent duplicate work when two requests in the same runtime ask for the
// same product simultaneously. PostgreSQL remains the durable cache/gate.
const inFlight = new Map<number, Promise<any>>();

type ImageCandidate = { url: string; sourceUrl?: string; title?: string };
type Product = { id: number; title: string; brand: string; category: string };

type VisionVerdict = {
  url: string;
  matches: boolean;
  confidence: number;
  reason: string;
};

function tokens(s: string) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length > 2 && !STOP.has(x));
}

function textScore(item: ImageCandidate, product: Product) {
  const ts = tokens(`${product.brand !== "Generic" ? product.brand : ""} ${product.title}`);
  const hay = `${item.title || ""} ${item.sourceUrl || item.url || ""}`.toLowerCase();
  const hits = ts.filter((t) => hay.includes(t)).length;
  return ts.length ? hits / ts.length : 0;
}

async function fetchImageAsBase64(url: string): Promise<{ data: string; mediaType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > 5_000_000) return null;
    return { data: Buffer.from(buf).toString("base64"), mediaType: contentType.split(";")[0] };
  } catch {
    return null;
  }
}

async function verifyImagesWithClaude(candidates: ImageCandidate[], product: Product): Promise<VisionVerdict[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

  const downloaded = await Promise.all(
    candidates.map(async (c) => ({ candidate: c, image: await fetchImageAsBase64(c.url) }))
  );
  const usable = downloaded.filter((d) => d.image);
  if (!usable.length) return [];

  const content: any[] = [{
    type: "text",
    text:
      `Product: "${product.title}" | Brand: ${product.brand} | Category: ${product.category}\n\n` +
      `Evaluate ${usable.length} candidate images labeled Image 1 through Image ${usable.length}. ` +
      `For EACH image, decide whether it genuinely depicts the named product: correct product type, ` +
      `brand marks when visible, form factor, and stated color/variant. Reject generic stock photos, ` +
      `lifestyle images that do not clearly show the product, wrong variants, and unrelated collages.\n\n` +
      `Respond ONLY with a JSON array, one object per image, in order: ` +
      `[{"index":1,"matches":true,"confidence":0.9,"reason":"..."}]`,
  }];

  usable.forEach((d, i) => {
    content.push({ type: "text", text: `Image ${i + 1}:` });
    content.push({ type: "image", source: { type: "base64", media_type: d.image!.mediaType, data: d.image!.data } });
  });

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 2000,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Claude vision call returned ${res.status}`);

  const data = await res.json();
  const text = (data.content || []).map((b: any) => b.text || "").join("");
  let parsed: any[];
  try {
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch {
    throw new Error("Claude vision returned non-JSON output");
  }

  return parsed
    .map((v: any) => {
      const idx = Number(v.index) - 1;
      const c = usable[idx]?.candidate;
      return {
        url: c?.url || "",
        matches: !!v.matches,
        confidence: Number(v.confidence) || 0,
        reason: String(v.reason || ""),
      };
    })
    .filter((v) => v.url);
}

async function resolveOne(productId?: number, productName?: string) {
  let product: any = null;
  if (productId) product = (await db.select().from(products).where(eq(products.id, productId)).limit(1))[0];
  if (!product && productName) {
    product = (
      await db.select().from(products).where(ilike(products.title, `%${productName}%`)).orderBy(asc(products.id)).limit(1)
    )[0];
  }
  if (!product) return { status: "NOT_FOUND", reason: "Product was not found in the catalogue" };

  // Durable cache: if the gallery already has enough approved images, do not
  // call SearXNG or Claude again. This is the key protection against repeated
  // autonomous runs and redeploys re-spending search/vision quota.
  const existing = await db.select().from(productImages).where(eq(productImages.productId, product.id));
  const approved = existing
    .filter((x) => String(x.verificationStatus) === "AI_VISION_VERIFIED" && !BAD.test(x.imageUrl))
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (approved.length >= MIN_IMAGES) {
    return {
      status: "COMPLETE_MEDIA_RESOLVED",
      provider: "postgres-cache",
      productId: product.id,
      product: product.title,
      imageCount: Math.min(approved.length, MAX_IMAGES),
      images: approved.slice(0, MAX_IMAGES).map((x) => ({ url: x.imageUrl, confidence: 1, reason: "Previously AI-vision-verified" })),
      cached: true,
      message: "Existing verified gallery reused; no external image-search or vision call was made.",
    };
  }

  const fashion = FASHION.test(`${product.category} ${product.title}`);
  const base = `${product.title} ${product.brand !== "Generic" ? product.brand : ""}`.trim();
  // Two focused searches are enough to populate a gallery. Avoid four searches
  // per product, which amplified provider load during autonomous runs.
  const queries = fashion
    ? [`${base} product photo`, `${base} front back colour variant`]
    : [`${base} official product image`, `${base} packaging front back product images`];

  const found: ImageCandidate[] = [];
  for (const q of queries) {
    const results = await searxngImageSearch(q, { limit: SEARCH_LIMIT, timeoutMs: 15000 });
    found.push(...results.map((r) => ({ url: r.url, sourceUrl: r.sourceUrl, title: r.title })));
  }

  const seen = new Set<string>();
  const preFiltered = found
    .filter((x) => x.url && /^https?:\/\//i.test(x.url) && !BAD.test(x.url))
    .filter((x) => (seen.has(x.url) ? false : (seen.add(x.url), true)))
    .map((x) => ({ ...x, textScore: textScore(x, product) }))
    .filter((x) => x.textScore > 0)
    .sort((a, b) => b.textScore - a.textScore)
    .slice(0, MAX_VISION_CANDIDATES);

  if (!preFiltered.length) {
    return {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: 0,
      searched: queries,
      message: "No plausible candidate images found. Listing left unchanged.",
    };
  }

  let verdicts: VisionVerdict[];
  try {
    verdicts = await verifyImagesWithClaude(preFiltered, product);
  } catch (e) {
    return {
      status: "VERIFICATION_FAILED",
      productId: product.id,
      product: product.title,
      error: e instanceof Error ? e.message : "Claude vision verification failed",
      message: "Vision verification could not run. Listing left unchanged rather than guessing.",
    };
  }

  const accepted = verdicts
    .filter((v) => v.matches && v.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_IMAGES);

  if (accepted.length < MIN_IMAGES) {
    return {
      status: "NEEDS_IMAGES",
      productId: product.id,
      product: product.title,
      imageCount: accepted.length,
      verdicts,
      searched: queries,
      message: `Only ${accepted.length} image(s) passed vision verification (need ${MIN_IMAGES}). Listing left unchanged.`,
    };
  }

  const meta = accepted.map((v) => preFiltered.find((d) => d.url === v.url));

  // Replace the gallery atomically: a failed insert cannot leave a product
  // with its old gallery deleted and its new gallery only partially written.
  await db.transaction(async (tx) => {
    await tx.delete(productImages).where(eq(productImages.productId, product.id));
    await tx.insert(productImages).values(
      accepted.map((v, index) => ({
        productId: product.id,
        imageUrl: v.url,
        sourceUrl: meta[index]?.sourceUrl || v.url,
        sortOrder: index,
        altText: meta[index]?.title || `${product.title} view ${index + 1}`,
        verificationStatus: "AI_VISION_VERIFIED",
      }))
    );
    await tx.update(products).set({ imageUrl: accepted[0].url, updatedAt: new Date() }).where(eq(products.id, product.id));
  });

  return {
    status: "COMPLETE_MEDIA_RESOLVED",
    provider: "searxng+claude-vision",
    productId: product.id,
    product: product.title,
    imageCount: accepted.length,
    images: accepted.map((v) => ({ url: v.url, confidence: v.confidence, reason: v.reason })),
    cached: false,
    message: `${accepted.length} images passed Claude vision verification and were saved.`,
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
  const batch = productList.slice(0, maxBatch);
  const out: any[] = [];
  for (const p of batch) {
    try {
      out.push(await resolveVerifiedProductMedia(p.id));
    } catch (e) {
      out.push({ status: "ERROR", productId: p.id, error: e instanceof Error ? e.message : "resolve failed" });
    }
  }
  return out;
}
